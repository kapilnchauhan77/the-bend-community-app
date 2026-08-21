import XCTest
import WebKit
@testable import App

@MainActor
final class DynamicTypeBridgeViewControllerTests: XCTestCase {
    private final class ScriptMessageObserver: NSObject, WKScriptMessageHandler {
        private let didReceive: (WKScriptMessage) -> Void

        init(didReceive: @escaping (WKScriptMessage) -> Void) {
            self.didReceive = didReceive
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            didReceive(message)
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

        let configuration = WKWebViewConfiguration()
        let webView = controller.webView(with: .zero, configuration: configuration)

        let userContentController = webView.configuration.userContentController
        userContentController.addUserScript(
            WKUserScript(
                source: "window.existingUserScriptValue = 'preserved';",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let reloaded = expectation(description: "Latest scale applied after reload")
        let scriptMessageObserver = ScriptMessageObserver { message in
            let result = message.body as? [String: Any]
            XCTAssertEqual(result?["scale"] as? String, "160%")
            XCTAssertEqual(result?["existingUserScriptValue"] as? String, "preserved")
            reloaded.fulfill()
        }
        let messageHandlerName = "dynamicTypeReloadProof"
        userContentController.add(scriptMessageObserver, name: messageHandlerName)
        defer {
            userContentController.removeScriptMessageHandler(forName: messageHandlerName)
        }
        userContentController.addUserScript(
            WKUserScript(
                source: """
                (() => {
                  if (!document.querySelector('[data-dynamic-type-reload-proof]')) return;
                  window.webkit.messageHandlers.\(messageHandlerName).postMessage({
                    scale: getComputedStyle(document.documentElement)
                      .getPropertyValue('--native-content-text-scale')
                      .trim(),
                    existingUserScriptValue: window.existingUserScriptValue ?? null
                  });
                })();
                """,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )

        multiplier = 1.6
        NotificationCenter.default.post(
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )

        webView.loadHTMLString(
            "<html><body data-dynamic-type-reload-proof>Reloaded</body></html>",
            baseURL: nil
        )

        wait(for: [reloaded], timeout: 20)
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
