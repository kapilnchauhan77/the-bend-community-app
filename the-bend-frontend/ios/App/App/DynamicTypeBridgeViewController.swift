import Capacitor
import UIKit
import WebKit

enum NativeContentTextScale {
    private static let basePointSize: CGFloat = 16
    private static let posixLocale = Locale(identifier: "en_US_POSIX")
    private static let userScriptMarker = "/* bend-native-content-text-scale */"

    static func multiplier(compatibleWith traitCollection: UITraitCollection) -> CGFloat {
        let scaledPointSize = UIFontMetrics(forTextStyle: .body).scaledValue(
            for: basePointSize,
            compatibleWith: traitCollection
        )
        return scaledPointSize / basePointSize
    }

    static func cssPercentage(for multiplier: CGFloat) -> String {
        guard multiplier.isFinite, multiplier > 0 else { return "100%" }

        var formatted = String(
            format: "%.4f",
            locale: posixLocale,
            Double(multiplier * 100)
        )
        while formatted.last == "0" {
            formatted.removeLast()
        }
        if formatted.last == "." {
            formatted.removeLast()
        }
        return "\(formatted)%"
    }

    static func javaScript(cssPercentage: String) -> String {
        """
        \(userScriptMarker)
        (() => {
          const applyNativeContentTextScale = () => {
            document.documentElement?.style.setProperty('--native-content-text-scale', '\(cssPercentage)');
          };
          if (document.documentElement) {
            applyNativeContentTextScale();
          } else {
            document.addEventListener('DOMContentLoaded', applyNativeContentTextScale, { once: true });
          }
        })();
        """
    }

    static func replaceDocumentStartUserScript(
        in userContentController: WKUserContentController,
        cssPercentage: String
    ) {
        let preservedScripts = userContentController.userScripts.filter {
            !$0.source.hasPrefix(userScriptMarker)
        }

        userContentController.removeAllUserScripts()
        for script in preservedScripts {
            userContentController.addUserScript(script)
        }
        userContentController.addUserScript(
            WKUserScript(
                source: javaScript(cssPercentage: cssPercentage),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
    }
}

final class NativeContentTextScaleCoordinator {
    private let notificationCenter: NotificationCenter
    private let currentCSSPercentage: () -> String
    private let prepareNextDocument: (String) -> Void
    private let applyJavaScript: (String) -> Void
    private var observers: [NSObjectProtocol] = []

    init(
        notificationCenter: NotificationCenter = .default,
        currentCSSPercentage: @escaping () -> String,
        prepareNextDocument: @escaping (String) -> Void = { _ in },
        applyJavaScript: @escaping (String) -> Void
    ) {
        self.notificationCenter = notificationCenter
        self.currentCSSPercentage = currentCSSPercentage
        self.prepareNextDocument = prepareNextDocument
        self.applyJavaScript = applyJavaScript
        for notificationName in [
            UIContentSizeCategory.didChangeNotification,
            UIApplication.didBecomeActiveNotification
        ] {
            observers.append(
                notificationCenter.addObserver(
                    forName: notificationName,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in
                    self?.applyCurrentScale()
                }
            )
        }
    }

    deinit {
        for observer in observers {
            notificationCenter.removeObserver(observer)
        }
    }

    private func applyCurrentScale() {
        let cssPercentage = currentCSSPercentage()
        prepareNextDocument(cssPercentage)
        applyJavaScript(
            NativeContentTextScale.javaScript(cssPercentage: cssPercentage)
        )
    }
}

final class DynamicTypeBridgeViewController: CAPBridgeViewController {
    private let contentTextScaleProvider: (UITraitCollection) -> CGFloat
    private weak var dynamicTypeWebView: WKWebView?
    private var contentTextScaleCoordinator: NativeContentTextScaleCoordinator?

    init(
        contentTextScaleProvider: @escaping (UITraitCollection) -> CGFloat = NativeContentTextScale.multiplier
    ) {
        self.contentTextScaleProvider = contentTextScaleProvider
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        contentTextScaleProvider = NativeContentTextScale.multiplier
        super.init(coder: coder)
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        NativeContentTextScale.replaceDocumentStartUserScript(
            in: configuration.userContentController,
            cssPercentage: currentCSSPercentage()
        )

        let webView = super.webView(with: frame, configuration: configuration)
        dynamicTypeWebView = webView
        return webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        contentTextScaleCoordinator = NativeContentTextScaleCoordinator(
            currentCSSPercentage: { [weak self] in
                self?.currentCSSPercentage() ?? "100%"
            },
            prepareNextDocument: { [weak self] cssPercentage in
                guard let userContentController = self?
                    .dynamicTypeWebView?
                    .configuration
                    .userContentController else { return }
                NativeContentTextScale.replaceDocumentStartUserScript(
                    in: userContentController,
                    cssPercentage: cssPercentage
                )
            },
            applyJavaScript: { [weak self] source in
                self?.dynamicTypeWebView?.evaluateJavaScript(source, completionHandler: nil)
            }
        )
    }

    private func currentCSSPercentage() -> String {
        NativeContentTextScale.cssPercentage(
            for: contentTextScaleProvider(traitCollection)
        )
    }
}
