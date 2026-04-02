import Foundation

extension Date {
    /// Parse an ISO 8601 / RFC 3339 string from the backend.
    static func fromISO(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        return ISO8601DateFormatter().date(from: string)
    }

    /// Short time format: "10:30 AM"
    var shortTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: self)
    }

    /// Relative date: "Today", "Yesterday", "Mar 15"
    var relativeDay: String {
        if Calendar.current.isDateInToday(self) { return "Today" }
        if Calendar.current.isDateInYesterday(self) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.dateFormat = Calendar.current.isDate(self, equalTo: .now, toGranularity: .year)
            ? "MMM d" : "MMM d, yyyy"
        return formatter.string(from: self)
    }

    /// Chat timestamp: "10:30 AM" for today, "Yesterday 10:30 AM", "Mar 15, 10:30 AM"
    var chatTimestamp: String {
        if Calendar.current.isDateInToday(self) { return shortTime }
        return "\(relativeDay), \(shortTime)"
    }
}
