package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/geovendas/glab/migrate/internal/loader"
	"github.com/geovendas/glab/migrate/internal/rocketchat"
	"github.com/geovendas/glab/migrate/internal/transform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// CLI flags.
	rcURL := flag.String("rc-url", "https://chat.geovendas.com", "RocketChat base URL")
	rcToken := flag.String("rc-token", "", "RocketChat auth token (required)")
	rcUserID := flag.String("rc-user-id", "", "RocketChat user ID (required)")
	dbURL := flag.String("db-url", "", "Glab database URL (required)")
	uploadDir := flag.String("upload-dir", "./uploads", "Directory for migrated files")
	dryRun := flag.Bool("dry-run", false, "Show what would be migrated without doing it")
	migrateFiles := flag.Bool("migrate-files", false, "Download and migrate files from RocketChat")
	since := flag.String("since", "", "Only migrate messages after this date (RFC3339, e.g. 2024-01-01T00:00:00Z)")

	flag.Parse()

	if *rcToken == "" || *rcUserID == "" || *dbURL == "" {
		fmt.Fprintln(os.Stderr, "Error: --rc-token, --rc-user-id, and --db-url are required")
		flag.Usage()
		os.Exit(1)
	}

	ctx := context.Background()

	// ── Phase 1: Export from RocketChat ──────────────────────────────────

	log.Println("=== Phase 1: Exporting from RocketChat ===")

	rc := rocketchat.NewClient(*rcURL, *rcToken, *rcUserID)

	log.Println("Fetching users...")
	rcUsers, err := rc.GetUsers()
	if err != nil {
		log.Fatalf("Failed to fetch users: %v", err)
	}
	log.Printf("Found %d users", len(rcUsers))

	log.Println("Fetching channels...")
	rcChannels, err := rc.GetChannels()
	if err != nil {
		log.Fatalf("Failed to fetch channels: %v", err)
	}
	log.Printf("Found %d public channels", len(rcChannels))

	log.Println("Fetching groups...")
	rcGroups, err := rc.GetGroups()
	if err != nil {
		log.Fatalf("Failed to fetch groups: %v", err)
	}
	log.Printf("Found %d private groups", len(rcGroups))

	log.Println("Fetching DMs...")
	rcDMs, err := rc.GetDMs()
	if err != nil {
		log.Fatalf("Failed to fetch DMs: %v", err)
	}
	log.Printf("Found %d DM rooms", len(rcDMs))

	allRooms := make([]rocketchat.RCRoom, 0, len(rcChannels)+len(rcGroups)+len(rcDMs))
	allRooms = append(allRooms, rcChannels...)
	allRooms = append(allRooms, rcGroups...)
	allRooms = append(allRooms, rcDMs...)

	// Fetch messages for each room.
	oldest := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	if *since != "" {
		t, err := time.Parse(time.RFC3339, *since)
		if err != nil {
			log.Fatalf("Invalid --since format: %v", err)
		}
		oldest = t
	}
	latest := time.Now()

	log.Printf("Fetching messages (since %s)...", oldest.Format("2006-01-02"))
	var allMessages []rocketchat.RCMessage
	for i, room := range allRooms {
		log.Printf("  [%d/%d] Room %s (%s)...", i+1, len(allRooms), room.Name, room.ID)
		msgs, err := rc.GetMessages(room.ID, room.Type, oldest, latest)
		if err != nil {
			log.Printf("  WARNING: Failed to fetch messages for room %s: %v", room.ID, err)
			continue
		}
		log.Printf("  Got %d messages", len(msgs))
		allMessages = append(allMessages, msgs...)
	}
	log.Printf("Total messages fetched: %d", len(allMessages))

	// ── Phase 2: Transform data ─────────────────────────────────────────

	log.Println("=== Phase 2: Transforming data ===")

	idMap := transform.NewIDMap()

	glabUsers := transform.TransformUsers(rcUsers, idMap)
	log.Printf("Transformed %d users", len(glabUsers))

	// Use the first admin user as the system user for channel creation.
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

	glabChannels := transform.TransformChannels(allRooms, idMap, systemUserID)
	log.Printf("Transformed %d channels", len(glabChannels))

	glabMembers := transform.TransformMembers(allRooms, idMap)
	log.Printf("Transformed %d memberships", len(glabMembers))

	glabMessages := transform.TransformMessages(allMessages, idMap)
	log.Printf("Transformed %d messages", len(glabMessages))

	glabReactions := transform.TransformReactions(allMessages, idMap)
	log.Printf("Transformed %d reactions", len(glabReactions))

	glabMentions := transform.ExtractMentions(glabMessages, idMap)
	log.Printf("Extracted %d mentions", len(glabMentions))

	// ── Dry run summary ─────────────────────────────────────────────────

	if *dryRun {
		log.Println("=== DRY RUN SUMMARY ===")
		log.Printf("Users:       %d", len(glabUsers))
		log.Printf("Channels:    %d", len(glabChannels))
		log.Printf("Members:     %d", len(glabMembers))
		log.Printf("Messages:    %d", len(glabMessages))
		log.Printf("Reactions:   %d", len(glabReactions))
		log.Printf("Mentions:    %d", len(glabMentions))
		log.Println("No data was written. Remove --dry-run to execute the migration.")
		return
	}

	// ── Phase 3: Load into Glab DB ──────────────────────────────────────

	log.Println("=== Phase 3: Loading into Glab database ===")

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

	if err := ldr.LoadUsers(ctx, glabUsers); err != nil {
		log.Fatalf("Failed to load users: %v", err)
	}

	if err := ldr.LoadChannels(ctx, glabChannels); err != nil {
		log.Fatalf("Failed to load channels: %v", err)
	}

	if err := ldr.LoadMembers(ctx, glabMembers); err != nil {
		log.Fatalf("Failed to load members: %v", err)
	}

	if err := ldr.LoadMessages(ctx, glabMessages); err != nil {
		log.Fatalf("Failed to load messages: %v", err)
	}

	if err := ldr.LoadReactions(ctx, glabReactions); err != nil {
		log.Fatalf("Failed to load reactions: %v", err)
	}

	if err := ldr.LoadMentions(ctx, glabMentions); err != nil {
		log.Fatalf("Failed to load mentions: %v", err)
	}

	log.Println("Rebuilding thread summaries...")
	if err := ldr.RebuildThreadSummaries(ctx); err != nil {
		log.Fatalf("Failed to rebuild thread summaries: %v", err)
	}

	log.Println("Refreshing search indexes...")
	if err := ldr.RefreshSearchIndexes(ctx); err != nil {
		log.Fatalf("Failed to refresh search indexes: %v", err)
	}

	// ── Phase 4: Migrate files (optional) ───────────────────────────────

	if *migrateFiles {
		log.Println("=== Phase 4: Migrating files ===")

		if err := os.MkdirAll(*uploadDir, 0o755); err != nil {
			log.Fatalf("Failed to create upload directory: %v", err)
		}

		fileCount := 0
		for _, msg := range allMessages {
			if msg.File == nil {
				continue
			}

			channelID, ok := idMap.Rooms[msg.RoomID]
			if !ok {
				continue
			}

			// Build RC download URL.
			fileURL := fmt.Sprintf("/file-upload/%s/%s", msg.File.ID, msg.File.Name)

			// Build local storage path matching Glab's convention.
			dir := filepath.Join(*uploadDir, channelID.String())
			if err := os.MkdirAll(dir, 0o755); err != nil {
				log.Printf("WARNING: Failed to create dir %s: %v", dir, err)
				continue
			}

			localPath := filepath.Join(dir, fmt.Sprintf("%s-%s", uuid.New().String()[:8], msg.File.Name))

			body, err := rc.DownloadFile(fileURL)
			if err != nil {
				log.Printf("WARNING: Failed to download file %s: %v", msg.File.Name, err)
				continue
			}

			out, err := os.Create(localPath)
			if err != nil {
				body.Close()
				log.Printf("WARNING: Failed to create file %s: %v", localPath, err)
				continue
			}

			if _, err := io.Copy(out, body); err != nil {
				out.Close()
				body.Close()
				log.Printf("WARNING: Failed to write file %s: %v", localPath, err)
				continue
			}

			out.Close()
			body.Close()
			fileCount++

			if fileCount%100 == 0 {
				log.Printf("  Downloaded %d files...", fileCount)
			}
		}

		log.Printf("Downloaded %d files to %s", fileCount, *uploadDir)
	}

	// ── Done ────────────────────────────────────────────────────────────

	log.Println("=== Migration complete ===")
	log.Printf("Summary:")
	log.Printf("  Users:       %d", len(glabUsers))
	log.Printf("  Channels:    %d", len(glabChannels))
	log.Printf("  Members:     %d", len(glabMembers))
	log.Printf("  Messages:    %d", len(glabMessages))
	log.Printf("  Reactions:   %d", len(glabReactions))
	log.Printf("  Mentions:    %d", len(glabMentions))
	log.Println("")
	log.Println("NOTE: All migrated users have a temporary password.")
	log.Println("Users must reset their passwords on first login.")
}
