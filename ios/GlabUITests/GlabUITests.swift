import XCTest

final class GlabUITests: XCTestCase {
    func testLaunchLogin() throws {
        let app = XCUIApplication()
        app.launch()
        // Verify login screen appears on fresh launch
        XCTAssertTrue(app.staticTexts["Welcome to Glab"].waitForExistence(timeout: 5) ||
                      app.staticTexts["Sign In"].waitForExistence(timeout: 5))
    }
}
