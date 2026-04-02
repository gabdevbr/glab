import SwiftUI

/// Renders message content with basic markdown support.
struct MarkdownTextView: View {
    let content: String

    var body: some View {
        Text(attributedContent)
            .textSelection(.enabled)
    }

    private var attributedContent: AttributedString {
        (try? AttributedString(markdown: content, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(content)
    }
}
