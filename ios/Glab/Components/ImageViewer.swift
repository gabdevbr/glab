import SwiftUI
import NukeUI

/// Full-screen image viewer with pinch-to-zoom and swipe-to-dismiss.
struct ImageViewerView: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            LazyImage(url: url) { state in
                if let image = state.image {
                    image
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(magnification)
                        .gesture(drag)
                        .onTapGesture(count: 2) {
                            withAnimation(.spring) {
                                if scale > 1 {
                                    scale = 1
                                    offset = .zero
                                } else {
                                    scale = 3
                                }
                                lastScale = scale
                                lastOffset = offset
                            }
                        }
                } else if state.isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .padding()
            }
        }
        .statusBarHidden()
    }

    private var magnification: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = lastScale * value.magnification
            }
            .onEnded { _ in
                withAnimation(.spring) {
                    scale = max(1, min(scale, 5))
                    lastScale = scale
                    if scale == 1 {
                        offset = .zero
                        lastOffset = .zero
                    }
                }
            }
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                if scale > 1 {
                    offset = CGSize(
                        width: lastOffset.width + value.translation.width,
                        height: lastOffset.height + value.translation.height
                    )
                } else {
                    offset = value.translation
                }
            }
            .onEnded { value in
                if scale <= 1 {
                    if abs(value.translation.height) > 100 {
                        dismiss()
                    } else {
                        withAnimation(.spring) {
                            offset = .zero
                        }
                    }
                }
                lastOffset = offset
            }
    }
}
