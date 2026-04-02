import SwiftUI

/// Header for a section group in the sidebar.
struct SectionHeaderView: View {
    let title: String
    @State private var isExpanded = true

    var body: some View {
        Button {
            withAnimation(.snappy(duration: 0.2)) {
                isExpanded.toggle()
            }
        } label: {
            HStack {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(width: 12)

                Text(title.uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer()
            }
        }
        .buttonStyle(.plain)
    }

    var expanded: Bool { isExpanded }
}
