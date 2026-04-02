import SwiftUI
import NukeUI

/// Displays a file message — inline image preview for images, download card for other files.
struct FileMessageView: View {
    let message: CachedMessage
    let onImageTap: ((URL) -> Void)?

    var body: some View {
        if message.isImage, let fileID = message.fileID, let serverURL = ServerEnvironment.serverURL {
            let thumbnailURL = serverURL.appendingPathComponent("/api/v1/files/\(fileID)/thumbnail")
            let fullURL = serverURL.appendingPathComponent("/api/v1/files/\(fileID)")

            Button {
                onImageTap?(fullURL)
            } label: {
                LazyImage(url: thumbnailURL) { state in
                    if let image = state.image {
                        image
                            .resizable()
                            .scaledToFit()
                    } else if state.isLoading {
                        ProgressView()
                            .frame(width: 200, height: 150)
                    } else {
                        fileCardView
                    }
                }
                .frame(maxWidth: 300, maxHeight: 300)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        } else {
            fileCardView
        }
    }

    private var fileCardView: some View {
        HStack(spacing: 10) {
            Image(systemName: fileIcon)
                .font(.title2)
                .foregroundStyle(.blue)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.fileOriginalName ?? message.fileName ?? "File")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)

                if let size = message.fileSizeBytes {
                    Text(ByteCountFormatter.string(fromByteCount: size, countStyle: .file))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if let fileID = message.fileID, let serverURL = ServerEnvironment.serverURL {
                Link(destination: serverURL.appendingPathComponent("/api/v1/files/\(fileID)")) {
                    Image(systemName: "arrow.down.circle")
                        .font(.title3)
                        .foregroundStyle(.blue)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(.secondary.opacity(0.08)))
    }

    private var fileIcon: String {
        guard let mime = message.fileMimeType else { return "doc.fill" }
        if mime.hasPrefix("image/") { return "photo.fill" }
        if mime.hasPrefix("video/") { return "film.fill" }
        if mime.hasPrefix("audio/") { return "music.note" }
        if mime.contains("pdf") { return "doc.richtext.fill" }
        if mime.contains("zip") || mime.contains("compressed") { return "doc.zipper" }
        if mime.contains("text") { return "doc.text.fill" }
        return "doc.fill"
    }
}
