import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Wraps PHPickerViewController for photo selection and UIDocumentPickerViewController for files.
struct FilePickerView: View {
    let onFilePicked: (Data, String, String) -> Void // data, filename, mimeType
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showDocumentPicker = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    PhotosPicker(selection: $selectedPhoto, matching: .any(of: [.images, .videos])) {
                        Label("Photo Library", systemImage: "photo.on.rectangle")
                    }
                }

                Section {
                    Button {
                        showDocumentPicker = true
                    } label: {
                        Label("Choose File", systemImage: "doc")
                    }
                }
            }
            .navigationTitle("Attach")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: selectedPhoto) { _, newValue in
                guard let item = newValue else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        let mimeType = item.supportedContentTypes.first?.preferredMIMEType ?? "application/octet-stream"
                        let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "dat"
                        let filename = "photo.\(ext)"
                        onFilePicked(data, filename, mimeType)
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showDocumentPicker) {
                DocumentPickerView { url in
                    guard let data = try? Data(contentsOf: url) else { return }
                    let filename = url.lastPathComponent
                    let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                    onFilePicked(data, filename, mimeType)
                    dismiss()
                }
            }
        }
    }
}

/// UIDocumentPickerViewController wrapper.
struct DocumentPickerView: UIViewControllerRepresentable {
    let onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item])
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            _ = url.startAccessingSecurityScopedResource()
            onPick(url)
            url.stopAccessingSecurityScopedResource()
        }
    }
}
