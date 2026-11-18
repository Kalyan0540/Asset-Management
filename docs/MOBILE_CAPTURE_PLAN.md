# Mobile capture exploration

The Android preview already accepts shared files and text through the Android Sharesheet. The next improvement is to make sharing from a browser or another app feel like a deliberate save into Atlas, with a thumbnail, a source when available, optional tags and a clear confirmation. [Atlas Android preview](ANDROID.md) · [Android receiving shared data](https://developer.android.com/training/sharing/receive)

## Recommended flow for Pinterest, Google, and browsers

| What the source offers | Atlas flow |
|---|---|
| **Share image** after a long press or from an app menu | Choose **Atlas**. Show a preview and let the user confirm the library, tags and folder. Copy the shared bytes into Atlas while Android still grants access. |
| **Share link** on a pin, search result or page | Save a bookmark note with the URL. If the link points to an image, offer **Save image** after a review step. The source may give Atlas only a page link, so preserve that link as the capture when a direct image is unavailable. |
| **Save image** in the browser | Save through Chrome, Brave or the source app, then choose it from Atlas's import picker. Use Android's Photo Picker where available. This is the fallback for images tied to the user's browser session. |
| **Share selected text** | Send the highlighted text to Atlas as a quote, with the page URL when the source includes it. Let the user add the source link before saving if it came through separately. |
| Multiple image files or a screenshot | Accept multiple shares in one review. Users can crop with Android's screenshot editor and **Share → Atlas** afterward. |

In Pinterest, try **Download image** on an image Pin and pick the saved file in Atlas. The option varies by Pin. When Pinterest shares a Pin link, save the link with the Pin title and offer a later attachment. In Google Images, open the publisher page when you want its image and source together. If Google shares only an address, the capture review should say **Save link**. If you share a downloaded file afterward, Atlas should let you add the source to that file. [Pinterest download help](https://help.pinterest.com/en/article/download-an-image) · [Google Images sharing help on Android](https://support.google.com/websearch/answer/118238?co=GENIE.Platform%3DAndroid)

## What would make it feel like Brave

1. **Start with the native share target.** Keep common saves to a preview and one confirmation. Preserve the original bytes and source type, and make the last-used folder and tags available. Show when the app saved a link, a quote, or an actual image. Test with Chrome, Brave, Google Photos, Pinterest and the Android screenshot tool on physical devices.
2. **Add a dependable mobile inbox.** Copy incoming files to Atlas's private staging area immediately and continue processing if the app leaves the foreground. Keep a compact retry list. Detect duplicate bytes while allowing separate references when the user wants them. Later, the sync queue can carry those captures to a desktop library.
3. **Evaluate an optional Atlas browse-and-save screen.** For users who frequently collect images, a page opened deliberately inside Atlas could offer a Brave-style long press and a save bar. A lower-cost alternative is **Paste a link** in Atlas. An embedded browser is a larger project. It needs navigation, accessibility, file permissions and sign-in testing. Start with sharing and the picker, which work across existing apps.

Expect differences by app and link type. A Pinterest share may contain a pin link. A Google Images result may link to the publisher or a preview. Authenticated images may only be available from the source app's download action. Keep those distinctions visible in Atlas. The mobile plan uses normal share permissions and does not rely on installing the desktop Chrome extension on Android. [Android Sharesheet guidance](https://developer.android.com/training/sharing/send) · [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker)
