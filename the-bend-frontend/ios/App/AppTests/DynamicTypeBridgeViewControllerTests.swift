import XCTest
import WebKit
@testable import App

@MainActor
final class DynamicTypeBridgeViewControllerTests: XCTestCase {
    private final class NavigationObserver: NSObject, WKNavigationDelegate {
        private let didFinish: (WKWebView) -> Void

        init(didFinish: @escaping (WKWebView) -> Void) {
            self.didFinish = didFinish
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            didFinish(webView)
        }
    }

    func testCSSPercentageUsesPOSIXDecimalFormattingAndTrimsNoise() {
        XCTAssertEqual(NativeContentTextScale.cssPercentage(for: 1.0), "100%")
        XCTAssertEqual(NativeContentTextScale.cssPercentage(for: 1.35), "135%")
        XCTAssertEqual(NativeContentTextScale.cssPercentage(for: 1.135938), "113.5938%")
    }

    func testJavaScriptSetsTheContentScaleAndWaitsForTheDocumentElementWhenNeeded() {
        let source = NativeContentTextScale.javaScript(cssPercentage: "135%")

        XCTAssertTrue(source.contains("--native-content-text-scale"))
        XCTAssertTrue(source.contains("'135%'"))
        XCTAssertTrue(source.contains("document.documentElement"))
        XCTAssertTrue(source.contains("DOMContentLoaded"))
        XCTAssertTrue(source.contains("once: true"))
    }

    func testBridgeInjectsTheInitialScaleAtDocumentStartForTheMainFrame() {
        let controller = DynamicTypeBridgeViewController(contentTextScaleProvider: { _ in 1.35 })
        let configuration = WKWebViewConfiguration()

        _ = controller.webView(with: .zero, configuration: configuration)

        let scripts = configuration.userContentController.userScripts
        XCTAssertEqual(scripts.count, 1)
        XCTAssertEqual(scripts[0].injectionTime, .atDocumentStart)
        XCTAssertTrue(scripts[0].isForMainFrameOnly)
        XCTAssertTrue(scripts[0].source.contains("--native-content-text-scale"))
        XCTAssertTrue(scripts[0].source.contains("'135%'"))
    }

    func testReloadAppliesTheLatestScaleWithoutRemovingExistingUserScripts() {
        var multiplier: CGFloat = 1.0
        let controller = DynamicTypeBridgeViewController(
            contentTextScaleProvider: { _ in multiplier }
        )
        controller.loadViewIfNeeded()

        guard let webView = controller.webView else {
            XCTFail("Expected Capacitor to create a web view")
            return
        }

        webView.configuration.userContentController.addUserScript(
            WKUserScript(
                source: "window.existingUserScriptValue = 'preserved';",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        multiplier = 1.6
        NotificationCenter.default.post(
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )

        let reloaded = expectation(description: "Latest scale applied after reload")
        let navigationObserver = NavigationObserver { reloadedWebView in
            reloadedWebView.evaluateJavaScript(
                """
                ({
                  scale: getComputedStyle(document.documentElement)
                    .getPropertyValue('--native-content-text-scale')
                    .trim(),
                  existingUserScriptValue: window.existingUserScriptValue ?? null
                })
                """
            ) { value, error in
                XCTAssertNil(error)
                let result = value as? [String: Any]
                XCTAssertEqual(result?["scale"] as? String, "160%")
                XCTAssertEqual(result?["existingUserScriptValue"] as? String, "preserved")
                reloaded.fulfill()
            }
        }
        webView.navigationDelegate = navigationObserver
        webView.loadHTMLString("<html><body>Reloaded</body></html>", baseURL: nil)

        withExtendedLifetime(navigationObserver) {
            wait(for: [reloaded], timeout: 5)
        }
    }

    func testCoordinatorAppliesTheCurrentScaleWhenContentSizeChanges() {
        let center = NotificationCenter()
        var percentage = "100%"
        var appliedScripts: [String] = []
        let coordinator = NativeContentTextScaleCoordinator(
            notificationCenter: center,
            currentCSSPercentage: { percentage },
            applyJavaScript: { appliedScripts.append($0) }
        )

        percentage = "160%"
        center.post(name: UIContentSizeCategory.didChangeNotification, object: nil)

        XCTAssertNotNil(coordinator)
        XCTAssertEqual(appliedScripts.count, 1)
        XCTAssertTrue(appliedScripts[0].contains("--native-content-text-scale"))
        XCTAssertTrue(appliedScripts[0].contains("'160%'"))
    }

    func testCoordinatorReappliesTheCurrentScaleWhenTheAppBecomesActive() {
        let center = NotificationCenter()
        var percentage = "100%"
        var appliedScripts: [String] = []
        let coordinator = NativeContentTextScaleCoordinator(
            notificationCenter: center,
            currentCSSPercentage: { percentage },
            applyJavaScript: { appliedScripts.append($0) }
        )

        percentage = "180%"
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)

        XCTAssertNotNil(coordinator)
        XCTAssertEqual(appliedScripts.count, 1)
        XCTAssertTrue(appliedScripts[0].contains("--native-content-text-scale"))
        XCTAssertTrue(appliedScripts[0].contains("'180%'"))
    }

    func testCoordinatorRemovesBothObserversOnDeinit() {
        let center = NotificationCenter()
        var applicationCount = 0
        var coordinator: NativeContentTextScaleCoordinator? = NativeContentTextScaleCoordinator(
            notificationCenter: center,
            currentCSSPercentage: { "100%" },
            applyJavaScript: { _ in applicationCount += 1 }
        )

        center.post(name: UIContentSizeCategory.didChangeNotification, object: nil)
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertEqual(applicationCount, 2)

        coordinator = nil
        XCTAssertNil(coordinator)
        center.post(name: UIContentSizeCategory.didChangeNotification, object: nil)
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)

        XCTAssertEqual(applicationCount, 2)
    }
}
