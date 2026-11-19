# Original Atlas feedback

Source: the message immediately before the review plan, 18 November 2026. Paragraph separators are reproduced as Markdown. The screenshots are indexed in their original order in [references](references/INDEX.md).

I would like to request several feature additions and UI improvements for the application.

First, please implement an AI-powered writing and management feature that can automatically categorize, tag, and manage files.

Second, optimize the connected node view to be highly responsive, similar to Obsidian and comparable tools, making file connections much smoother and easier.

Third, improve the linking experience. Introduce a slash command option for mapping out connections. When using the plus icon, add a preview on hover so users can easily identify the referenced item. Additionally, allow users to search and sort the link options list by date or type to make linking more efficient.

Fourth, redesign the top search filters area, as the current layout is not user-friendly.

Fifth, clean up the left-side navbar by removing unnecessary elements at the bottom, modeling this area after the Eagle UI.

Sixth, add tooltips or clear indicators for all views so users can easily identify them, mirroring the Eagle view experience. I can provide a recording of how Eagle manages this if needed.

Finally, support standard shortcuts and mouse actions throughout the tool, including copy, paste, right-clicks, and deletes.

Before making any changes, please first explain my request back to me and outline how we can achieve it, exploring options like AI management using MCP support or APIs. Additionally, the autosave feature I requested is still not working. There are also a few bugs that need to be addressed. When I deselect an element, node, or anything else, the right-side panel should not be visible, similar to how Eagle behaves, or it should show general details if nothing is selected. The default panel sizes should also be reduced and managed properly. Regarding the filters, the color filters are currently not working due to an issue with the hex codes it is looking into, so the color functionality needs to be fixed. Finally, within the type filter located below the search bar, there are no checkboxes or selection options, as it only shows a text input field, which also needs to be improved.

Hovering over a markdown file using its zoom icon does not trigger the preview. Additionally, video thumbnails are not generating or displaying properly, although the hover-to-seek functionality works as expected. The thumbnail generation issue needs to be addressed.

Simplify the user interface by removing unnecessary elements like three-dot menus. Instead, rely on right-click context menus and checkboxes for options. Use standard shortcuts, such as Shift+click and mouse dragging, for multi-selection. Not every functionality requires a dedicated UI space to be shown.

Currently, when I am inside a parent folder, all images are displayed directly instead of showing the subfolders. I have attached a screenshot of the Eagle app's current behavior, and I would like you to match it exactly.

For subfolders in the left panel use lines to indicate subfolders etc simlar to eagle

Please add the ability to delete folders, as this functionality is currently missing. Also, regarding the folders, hovering currently displays the rename and add subfolder actions. These could be hidden under a menu, since right-clicking already provides the folder options. I have attached an image for reference.

I used to have the functionality to collapse and expand all panels using the Ctrl + / keyboard shortcut. I have attached an image, specifically the fourth one, showing the desired detail view. Clicking on any image should open it within the current view where the center area is completely taken over by the selected element, while the left and right panels remain intact. The zoom functionality should be smooth, rather than having the sudden jumps currently happening in the UI. The other elements you added, fit to view, are good, but I would like the interface to be a bit more compact with the controls placed at the bottom, though I am open to top placement if you feel it works better. Also, notice how the top bar in Eagle, where the zoom and other options are located, smoothly transitions into the details view. Additionally, there are no separate buttons for next and previous navigation. Those should be shortcuts rather than standalone buttons. The positions of the zoom-in and zoom-out controls are currently incorrect; the zoom-out button should be on the left and the zoom-in on the right. Additionally, gestures for zooming in and out do not work in the details view and need to be added. I would prefer to have small UI elements for all zoom controls, and it would be much better if you kept the existing interface.

I have attached multiple screenshots of the side panel when an element is selected. Please ensure the UI matches these designs exactly, including the export options menu and the hover and click states for color indications. Please review the attached images.

Additionally, in the current version, the home page search bar has broken UI alignment and a nested search bar issue that needs to be fixed.

On the home page, using arrow keys does not move or select focus between elements. Please ensure that keyboard navigation works correctly using directional keys.

I have attached several screenshots of the application's menus for your reference. Please review them and consider reorganizing the layout and categorization to be similar to Eagle. You do not need to build all of Eagle's features, but please ensure these customization options are included in the menus. Additionally, please organize these images and notes into a dedicated folder for future reference.

Here is the feedback for simplifying the homepage and left sidebar to better align with Eagle's design philosophy.

On the homepage, we can significantly simplify the layout. For instance, the item count is currently displayed in multiple places, such as above, beside all items, and next to the sort option. This should be consolidated into a single location, and redundant item counts and excessive views should be removed. We only need core views like grid and list.

For zooming, instead of the current thumbnail size slider, use clickable plus and minus buttons similar to Eagle. The slider itself can be made thinner, resembling a progress bar, with a handle that expands on hover. A dedicated select all button may not be needed immediately, since Eagle relies on standard keyboard shortcuts like Command A or Control A. You can also remove the quick preview space, CTA, and streamline the top area to make it much more efficient.

For search, integrate the all types filter directly into the search bar, similar to Eagle. Separate new notes and file imports. Replace the note button with a general new button that, when clicked, opens a dropdown list of options, such as markdown and other formats we may support in the future.

In the left sidebar, simplify the filter folders option and move utilities like repairing Eagle folders stored on the machine to a secondary location. The overarching goal is to maximize focus on the actual content by removing unrelated elements. Ultimately, we want to closely replicate Eagle's design philosophy, style, and templates, only adding custom UI placements when necessary to accommodate missing Eagle functionalities. Please consider refining minor UI interactions to create more delightful experiences. For example, add a subtle zoom-in effect (around 1-2%) when hovering over elements on the homepage. Keep in mind that this might not suit all file types, such as videos, so please brainstorm alternative interaction ideas for those.

Additionally, regarding the homepage focus states, the selection border currently encompasses both the element and the text. Ideally, only the image or element should be highlighted with the border, and the text color can change separately to indicate selection. Please address these kinds of minor UI details. In hp when using gesture to zoom in/out make it step up and down.

Remove the "save changes" button from the right-side panel and implement autosave for all changes, using Eagle as a reference for the desired behavior. Please review these requirements and plan your approach. Before proceeding with implementation, let's align by having you summarize your understanding and list the elements we discussed to avoid unnecessary rework. Please ask if you have any questions or need clarification.

I have attached an example of an Obsidian graph view for your reference. Check for any open source for graph views instead of creating everything for start and you can customise on top of it. I also like the idea of using a tabbed approach, which would allow users to open multiple tabs and switch between them side-by-side, creating a hybrid experience.

The markdown editor view should utilize the available space more efficiently. Additionally, when using the slash command, the menu currently overlaps the cursor, which should be corrected to behave similarly to Notion and Obsidian without obstructing the cursor. Furthermore, when typing a heading and moving to the next line, the previous line should render the formatted preview rather than showing raw markdown syntax, allowing users to easily identify the headline format without requiring separate edit and view modes.

When using the slash command to attach an Atlas item, the search and menu currently shift to the top of the screen instead of remaining in the current editor view, which needs to be addressed. The editor should support attaching multiple items simultaneously, as well as adding images directly into the markdown. In the background, these images should be automatically organized into the uncategorized area or routed to relevant tagged areas based on the document tags. Each image should exist as a separate item while also being embedded and previewed inline within the markdown. Providing these comprehensive capabilities will greatly improve usability, similar to the efficient and flexible approach used in Notion.

Additionally, please consider adding native support for html, PDF and EPUB formats, including the ability to highlight text within both. For EPUBs, there should also be options to customize backgrounds, colors, and other visual elements. These can be planned as upcoming features for a future release, rather than immediate priorities. The overall idea is it is complete file and native management platform where in future I'll be using it to create like a figma canvas, have code blocks on canvas, add code bases and prototypes etc. This can get as much complex as this. So incase if you are building any articheture or elements think of scalability prespective as well.

Please explain how we should approach cross-device data syncing and data storage. I am a designer rather than a developer, so please break down the available options in simple, non-technical terms. I need solutions with zero upfront costs, but that also have the potential to scale if I decide to commercialize and sell this as a product later. Please take all these factors into account and outline the best options.

State all the things I mentioned and save things for future planning and images for references. Once we align you can proceed with further. Don't work on anything until I say to proceed.
