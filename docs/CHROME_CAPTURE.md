# Atlas Capture for Chrome

Atlas Capture is an early Chrome extension. It saves into the active Atlas desktop library on the same computer. Use desktop Atlas **0.8.0** or newer and keep it open during a capture.

## Install and pair

1. Download the Atlas desktop installer for your computer and the **Atlas Capture** ZIP from the same GitHub release. [Published Atlas downloads](https://github.com/Kalyan0540/Asset-Management/releases)
2. Extract the extension ZIP to a folder you can keep. In Chrome, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the folder that contains `manifest.json`. Pin **Atlas Capture** from Chrome's Extensions menu if you want it on the toolbar. [Chrome's unpacked installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
3. Open Atlas and choose **Browser Capture → Copy Pairing Key**. Open **Atlas Capture → Preferences** in Chrome, paste the key and select **Connect**. The extension shows your active library when it connects.

The ZIP is a GitHub preview package. Chrome's **Load unpacked** is the installation route for this version. Use **Browser Capture → Reset Pairing Key…** in Atlas if you need to revoke existing connections and pair again.

## Capture things from the browser

| Action | What Atlas saves |
|---|---|
| **Save URL** | A note named after the page, with the URL in its source field and Markdown body. Right-click a page or link for the same workflow. |
| **Save selection to Atlas** | Select text, then right-click and choose the Atlas action. Atlas stores the excerpt as a quoted note with the source page. Browser apps can also expose this under the Atlas Capture menu group. |
| **Batch save** | An image selection page with thumbnails, search, dimensions, type and domain filters. Check the images, optionally enter tags, and save up to 60 at a time. Results distinguish saved items and failures. Images from a separate site can require Chrome permission for that site. |
| **Capture visible**, **Capture area**, **Capture full page** | PNGs with the page URL. For area capture, drag the rectangle over the page or press Escape to cancel. Full page scrolls and stitches a bounded page, then restores your scroll position. |
| **Enable page tools** | Drag a page image or link to **Drop to save in Atlas**. To use the text quick action, turn on **Show a save action on double-clicked text** in Preferences first. Then double-click a word and choose the Atlas prompt. |
| **Preferences** | Choose light, dark or system appearance, set default capture tags, pair or disconnect, and turn drag and text tools on or off. |

The extension handles normal web pages and loaded image elements. Batch scanning collects up to 300 candidates. It skips many small icons and uses the actual image URL the page supplied. JPEG, PNG, WebP, GIF and AVIF are accepted up to 24 MB each. Images that require a signed-in session, redirects, or the site's own download controls can fail. Try a screenshot or the site's own Share or Download action in that case. Full-page capture supports the scrollable document up to twelve viewports, 16,000 image pixels high and 25 million pixels overall. Sticky headers can repeat, and pages that grow while scrolling can need visible or area capture instead. Chrome limits capture and script access on its own pages. [Chrome active tab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) · [Chrome capture API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)

## Where captures go

Atlas saves directly to your active library. Image captures use the usual asset storage and can match existing import rules. If the desktop app is closed, the extension reports the connection failure. A durable queue for saving later is a separate planned feature. The browser key controls a limited local connection for creating captures. Image downloads happen in Chrome, and Atlas receives the chosen bytes. The Atlas library and MCP credential stay separate from the extension pairing key. [Chrome cross-origin access](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
