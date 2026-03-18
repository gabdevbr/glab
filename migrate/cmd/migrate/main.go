package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/geovendas/glab/migrate/internal/loader"
	"github.com/geovendas/glab/migrate/internal/rocketchat"
	"github.com/geovendas/glab/migrate/internal/s3uploader"
	"github.com/geovendas/glab/migrate/internal/transform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Manifest tracks export state per room for incremental exports.
type Manifest struct {
	Rooms map[string]RoomExportState `json:"rooms"`
}

type RoomExportState struct {
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	MessageCount int       `json:"message_count"`
	LatestExport time.Time `json:"latest_export"`
}

func main() {
	rcURL := flag.String("rc-url", "", "RocketChat base URL (e.g. https://your-rocketchat.com)")
	rcToken := flag.String("rc-token", "", "RocketChat auth token")
	rcUserID := flag.String("rc-user-id", "", "RocketChat user ID")
	dbURL := flag.String("db-url", "", "Glab database URL")
	dataDir := flag.String("data-dir", "./data", "Directory for exported JSON data")
	exportOnly := flag.Bool("export-only", false, "Only export from RC to files (no DB load)")
	loadOnly := flag.Bool("load-only", false, "Only load from files to DB (no RC export)")
	since := flag.String("since", "", "Only messages after this date (RFC3339)")
	migrateFiles := flag.Bool("migrate-files", false, "Download and migrate files from RocketChat")
	uploadDir := flag.String("upload-dir", "./uploads", "Directory for migrated files (local mode)")

	// S3 flags — when set, files stream directly to S3 instead of local disk.
	s3Endpoint := flag.String("s3-endpoint", "", "S3-compatible endpoint URL (e.g. https://s3.us-east.cloud-object-storage.appdomain.cloud)")
	s3Bucket := flag.String("s3-bucket", "", "S3 bucket name")
	s3Region := flag.String("s3-region", "us-east-1", "S3 region")
	s3AccessKey := flag.String("s3-access-key", "", "S3 access key ID")
	s3SecretKey := flag.String("s3-secret-key", "", "S3 secret access key")
	s3KeyPrefix := flag.String("s3-key-prefix", "", "Optional prefix for all S3 keys")
	s3PathStyle := flag.Bool("s3-path-style", false, "Use path-style addressing (required for MinIO, IBM COS)")

	flag.Parse()

	if !*loadOnly && (*rcToken == "" || *rcUserID == "") {
		fmt.Fprintln(os.Stderr, "Error: --rc-token and --rc-user-id required for export")
		flag.Usage()
		os.Exit(1)
	}
	if !*exportOnly && *dbURL == "" {
		fmt.Fprintln(os.Stderr, "Error: --db-url required for load")
		flag.Usage()
		os.Exit(1)
	}

	// Ensure data directories exist.
	msgDir := filepath.Join(*dataDir, "messages")
	os.MkdirAll(msgDir, 0o755)

	// ── EXPORT PHASE ────────────────────────────────────────────────────

	if !*loadOnly {
		rc := rocketchat.NewClient(*rcURL, *rcToken, *rcUserID)
		manifest := loadManifest(*dataDir)

		// Export users (always refresh — users may have been added/modified).
		log.Println("=== Export: Fetching users ===")
		rcUsers, err := rc.GetUsers()
		if err != nil {
			log.Fatalf("Failed to fetch users: %v", err)
		}
		log.Printf("Found %d users", len(rcUsers))
		saveJSON(filepath.Join(*dataDir, "users.json"), rcUsers)

		// Export rooms (always refresh).
		log.Println("=== Export: Fetching rooms ===")
		rcChannels, err := rc.GetChannels()
		if err != nil {
			log.Fatalf("Failed to fetch channels: %v", err)
		}
		log.Printf("Found %d public channels", len(rcChannels))

		rcGroups, err := rc.GetGroups()
		if err != nil {
			log.Fatalf("Failed to fetch groups: %v", err)
		}
		log.Printf("Found %d private groups", len(rcGroups))

		rcDMs, err := rc.GetDMs()
		if err != nil {
			log.Fatalf("Failed to fetch DMs: %v", err)
		}
		log.Printf("Found %d DM rooms", len(rcDMs))

		allRooms := make([]rocketchat.RCRoom, 0, len(rcChannels)+len(rcGroups)+len(rcDMs))
		allRooms = append(allRooms, rcChannels...)
		allRooms = append(allRooms, rcGroups...)
		allRooms = append(allRooms, rcDMs...)
		saveJSON(filepath.Join(*dataDir, "rooms.json"), allRooms)

		// Export messages per room (incremental).
		globalOldest := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
		if *since != "" {
			t, err := time.Parse(time.RFC3339, *since)
			if err != nil {
				log.Fatalf("Invalid --since format: %v", err)
			}
			globalOldest = t
		}

		log.Printf("=== Export: Fetching messages (%d rooms) ===", len(allRooms))
		totalNew := 0
		for i, room := range allRooms {
			roomName := room.Name
			if roomName == "" {
				roomName = room.ID
			}

			// Determine the oldest timestamp for this room.
			oldest := globalOldest
			if state, ok := manifest.Rooms[room.ID]; ok {
				// Delta export: only fetch messages after the last export.
				if state.LatestExport.After(oldest) {
					oldest = state.LatestExport.Add(time.Millisecond)
				}
			}
			latest := time.Now()

			log.Printf("  [%d/%d] %s — fetching since %s...", i+1, len(allRooms), roomName, oldest.Format("2006-01-02 15:04"))
			msgs, err := rc.GetMessages(room.ID, room.Type, oldest, latest)
			if err != nil {
				log.Printf("  WARNING: Failed to fetch messages for %s: %v", roomName, err)
				continue
			}

			if len(msgs) > 0 {
				// Append new messages to the room's JSONL file.
				msgFile := filepath.Join(msgDir, room.ID+".jsonl")
				appendJSONL(msgFile, msgs)
				totalNew += len(msgs)
				log.Printf("  +%d messages (saved to %s.jsonl)", len(msgs), room.ID)

				// Find the latest timestamp in this batch.
				latestTS := time.Time{}
				for _, m := range msgs {
					t := time.UnixMilli(m.Timestamp.Date)
					if t.After(latestTS) {
						latestTS = t
					}
				}

				// Update manifest.
				prev := manifest.Rooms[room.ID]
				manifest.Rooms[room.ID] = RoomExportState{
					Name:         roomName,
					Type:         room.Type,
					MessageCount: prev.MessageCount + len(msgs),
					LatestExport: latestTS,
				}
				// Save manifest after EACH room (crash-safe).
				saveJSON(filepath.Join(*dataDir, "manifest.json"), manifest)
			} else {
				log.Printf("  0 new messages")
				// Still register the room in manifest if not present.
				if _, ok := manifest.Rooms[room.ID]; !ok {
					manifest.Rooms[room.ID] = RoomExportState{
						Name:         roomName,
						Type:         room.Type,
						MessageCount: 0,
						LatestExport: time.Now(),
					}
					saveJSON(filepath.Join(*dataDir, "manifest.json"), manifest)
				}
			}
		}

		log.Printf("Export complete: %d new messages across %d rooms", totalNew, len(allRooms))

		// File download (optional, during export phase).
		if *migrateFiles {
			log.Println("=== Export: Downloading files ===")

			// Build S3 uploader if configured; nil means local disk mode.
			var s3up *s3uploader.Uploader
			if *s3Bucket != "" {
				var err error
				s3up, err = s3uploader.New(context.Background(), s3uploader.Config{
					Endpoint:       *s3Endpoint,
					Region:         *s3Region,
					Bucket:         *s3Bucket,
					AccessKeyID:    *s3AccessKey,
					SecretAccessKey: *s3SecretKey,
					KeyPrefix:      *s3KeyPrefix,
					ForcePathStyle: *s3PathStyle,
				})
				if err != nil {
					log.Fatalf("Failed to initialize S3: %v", err)
				}
				log.Printf("S3 mode: streaming files to %s/%s", *s3Bucket, *s3KeyPrefix)
			}

			downloadFiles(rc, *dataDir, msgDir, *uploadDir, s3up)
		}
	}

	if *exportOnly {
		log.Println("Export-only mode. Skipping database load.")
		return
	}

	// ── LOAD PHASE ──────────────────────────────────────────────────────

	ctx := context.Background()

	log.Println("=== Load: Connecting to database ===")
	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Connected to database")

	ldr := loader.NewLoader(pool)

	// Read exported data from files.
	rcUsers := loadJSON[[]rocketchat.RCUser](filepath.Join(*dataDir, "users.json"))
	rcRooms := loadJSON[[]rocketchat.RCRoom](filepath.Join(*dataDir, "rooms.json"))

	// Transform users and channels (builds IDMap).
	idMap := transform.NewIDMap()
	glabUsers := transform.TransformUsers(rcUsers, idMap)
	log.Printf("Transformed %d users", len(glabUsers))

	systemUserID := uuid.Nil
	for _, u := range glabUsers {
		if u.Role == "admin" {
			systemUserID = u.ID
			break
		}
	}
	if systemUserID == uuid.Nil && len(glabUsers) > 0 {
		systemUserID = glabUsers[0].ID
	}

	glabChannels := transform.TransformChannels(rcRooms, idMap, systemUserID)
	log.Printf("Transformed %d channels", len(glabChannels))

	glabMembers := transform.TransformMembers(rcRooms, idMap)
	log.Printf("Transformed %d memberships", len(glabMembers))

	// Upsert users, channels, members (idempotent).
	log.Println("=== Load: Upserting users ===")
	if err := ldr.UpsertUsers(ctx, glabUsers); err != nil {
		log.Fatalf("Failed to upsert users: %v", err)
	}

	log.Println("=== Load: Upserting channels ===")
	if err := ldr.UpsertChannels(ctx, glabChannels); err != nil {
		log.Fatalf("Failed to upsert channels: %v", err)
	}

	log.Println("=== Load: Upserting memberships ===")
	if err := ldr.UpsertMembers(ctx, glabMembers); err != nil {
		log.Fatalf("Failed to upsert members: %v", err)
	}

	// Load messages per room (incremental).
	log.Println("=== Load: Loading messages per room ===")

	// List all message files.
	msgFiles, _ := filepath.Glob(filepath.Join(msgDir, "*.jsonl"))
	sort.Strings(msgFiles)

	totalMsgs := 0
	totalReactions := 0
	totalMentions := 0

	for i, msgFile := range msgFiles {
		roomID := filepath.Base(msgFile)
		roomID = roomID[:len(roomID)-6] // strip ".jsonl"

		// Read messages from JSONL file.
		rcMsgs := readJSONL[rocketchat.RCMessage](msgFile)
		if len(rcMsgs) == 0 {
			continue
		}

		roomName := roomID
		if _, ok := idMap.Rooms[roomID]; !ok {
			// Room wasn't in the rooms export — skip.
			log.Printf("  [%d/%d] Skipping %s (room not found in export)", i+1, len(msgFiles), roomID)
			continue
		}

		// Find room name for logging.
		for _, r := range rcRooms {
			if r.ID == roomID {
				if r.Name != "" {
					roomName = r.Name
				}
				break
			}
		}

		// Transform this room's messages.
		msgs := transform.TransformMessages(rcMsgs, idMap)
		reactions := transform.TransformReactions(rcMsgs, idMap)
		mentions := transform.ExtractMentions(msgs, idMap)

		// Filter reactions/mentions to only reference messages that were actually included.
		// Messages from inactive users are skipped, but their reactions still exist.
		includedMsgs := make(map[uuid.UUID]bool, len(msgs))
		for _, m := range msgs {
			includedMsgs[m.ID] = true
		}
		filteredReactions := reactions[:0]
		for _, r := range reactions {
			if includedMsgs[r.MessageID] {
				filteredReactions = append(filteredReactions, r)
			}
		}
		reactions = filteredReactions

		// Load into DB (idempotent via ON CONFLICT DO NOTHING).
		if err := ldr.LoadRoomData(ctx, msgs, reactions, mentions); err != nil {
			log.Printf("  WARNING: Failed to load room %s: %v", roomName, err)
			continue
		}

		totalMsgs += len(msgs)
		totalReactions += len(reactions)
		totalMentions += len(mentions)
		log.Printf("  [%d/%d] %s: %d msgs, %d reactions, %d mentions",
			i+1, len(msgFiles), roomName, len(msgs), len(reactions), len(mentions))
	}

	log.Printf("Loaded %d messages, %d reactions, %d mentions", totalMsgs, totalReactions, totalMentions)

	// Rebuild thread summaries and search indexes.
	log.Println("Rebuilding thread summaries...")
	if err := ldr.RebuildThreadSummaries(ctx); err != nil {
		log.Fatalf("Failed to rebuild thread summaries: %v", err)
	}

	log.Println("Refreshing search indexes...")
	if err := ldr.RefreshSearchIndexes(ctx); err != nil {
		log.Fatalf("Failed to refresh search indexes: %v", err)
	}

	log.Println("=== Migration complete ===")
	log.Printf("  Users:     %d", len(glabUsers))
	log.Printf("  Channels:  %d", len(glabChannels))
	log.Printf("  Members:   %d", len(glabMembers))
	log.Printf("  Messages:  %d", totalMsgs)
	log.Printf("  Reactions: %d", totalReactions)
	log.Printf("  Mentions:  %d", totalMentions)
}

// ── File helpers ────────────────────────────────────────────────────────

func loadManifest(dataDir string) Manifest {
	path := filepath.Join(dataDir, "manifest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{Rooms: make(map[string]RoomExportState)}
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{Rooms: make(map[string]RoomExportState)}
	}
	if m.Rooms == nil {
		m.Rooms = make(map[string]RoomExportState)
	}
	return m
}

func saveJSON(path string, v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal JSON for %s: %v", path, err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		log.Fatalf("Failed to write %s: %v", path, err)
	}
}

func loadJSON[T any](path string) T {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Failed to read %s: %v (run export first)", path, err)
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		log.Fatalf("Failed to parse %s: %v", path, err)
	}
	return v
}

func appendJSONL(path string, items interface{}) {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.Fatalf("Failed to open %s for append: %v", path, err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	// items is a slice — we need to iterate.
	switch v := items.(type) {
	case []rocketchat.RCMessage:
		for _, item := range v {
			if err := enc.Encode(item); err != nil {
				log.Fatalf("Failed to encode message: %v", err)
			}
		}
	default:
		log.Fatalf("appendJSONL: unsupported type %T", items)
	}
}

func readJSONL[T any](path string) []T {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var items []T
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB per line
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var item T
		if err := json.Unmarshal(line, &item); err != nil {
			log.Printf("WARNING: Failed to parse JSONL line: %v", err)
			continue
		}
		items = append(items, item)
	}
	return items
}

// downloadFiles handles file migration. When s3up is non-nil, files stream
// directly from RocketChat to S3 (zero local disk). Otherwise, saves to uploadDir.
func downloadFiles(rc *rocketchat.Client, dataDir, msgDir, uploadDir string, s3up *s3uploader.Uploader) {
	if s3up == nil {
		os.MkdirAll(uploadDir, 0o755)
	}

	// Read rooms for ID mapping.
	rcRooms := loadJSON[[]rocketchat.RCRoom](filepath.Join(dataDir, "rooms.json"))
	idMap := transform.NewIDMap()

	for _, r := range rcRooms {
		idMap.Rooms[r.ID] = transform.DeterministicID("room:" + r.ID)
	}

	// Scan all message files for file attachments.
	msgFiles, _ := filepath.Glob(filepath.Join(msgDir, "*.jsonl"))
	fileCount := 0
	skipped := 0
	ctx := context.Background()

	for _, msgFile := range msgFiles {
		msgs := readJSONL[rocketchat.RCMessage](msgFile)
		for _, msg := range msgs {
			if msg.File == nil {
				continue
			}

			channelID, ok := idMap.Rooms[msg.RoomID]
			if !ok {
				continue
			}

			fileName := fmt.Sprintf("%s-%s",
				transform.DeterministicID("file:"+msg.File.ID).String()[:8], msg.File.Name)
			s3Key := channelID.String() + "/" + fileName

			// Incremental: skip if already exists at destination.
			if s3up != nil {
				exists, err := s3up.Exists(ctx, s3Key)
				if err != nil {
					log.Printf("WARNING: S3 exists check failed for %s: %v", msg.File.Name, err)
					continue
				}
				if exists {
					skipped++
					continue
				}
			} else {
				dir := filepath.Join(uploadDir, channelID.String())
				os.MkdirAll(dir, 0o755)
				localPath := filepath.Join(dir, fileName)
				if _, err := os.Stat(localPath); err == nil {
					skipped++
					continue
				}
			}

			// Download from RocketChat.
			fileURL := fmt.Sprintf("/file-upload/%s/%s", msg.File.ID, msg.File.Name)
			dl, err := rc.DownloadFile(fileURL)
			if err != nil {
				log.Printf("WARNING: Failed to download %s: %v", msg.File.Name, err)
				continue
			}

			if s3up != nil {
				// Stream directly to S3 — no local disk.
				err = s3up.Put(ctx, s3Key, dl.Body, dl.ContentType, dl.Size)
				dl.Body.Close()
				if err != nil {
					log.Printf("WARNING: Failed to upload %s to S3: %v", msg.File.Name, err)
					continue
				}
			} else {
				// Save to local disk.
				localPath := filepath.Join(uploadDir, channelID.String(), fileName)
				out, err := os.Create(localPath)
				if err != nil {
					dl.Body.Close()
					continue
				}
				io.Copy(out, dl.Body)
				out.Close()
				dl.Body.Close()
			}

			fileCount++
			if fileCount%100 == 0 {
				log.Printf("  Migrated %d files (skipped %d existing)...", fileCount, skipped)
			}
		}
	}

	dest := uploadDir
	if s3up != nil {
		dest = "S3"
	}
	log.Printf("Migrated %d files to %s (skipped %d existing)", fileCount, dest, skipped)
}
