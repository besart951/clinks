# Responsive UI review

Open the changed flow from the same entry point a user takes. A profile page can fit on a phone while its open mail chooser extends off screen.

- Test a populated workspace with realistic long names, email addresses and translated option labels. Exercise overlays, expanded menus, sheets and validation states touched by the change.
- Compare a desktop viewport (e.g. 1440 × 900) with a phone (390 × 844). For multi-line choices also try 320 px wide. For long forms or dialogs try landscape (844 × 390). Wait for data and resize transitions before measuring.
- Keep option labels and supporting text inside their buttons. Allow grid tracks and flex children to shrink and text to wrap. Keep labels, icons, adjacent rows and the close control clear of one another.
- Keep the page within the viewport. Wide boards and tables may scroll in their own region. Tall dialogs must fit the current viewport, scroll internally and allow the last action and dismissal to be reached by touch and keyboard.
- Test the failing state with Playwright. Measure the control against its dialog as well as the dialog against the viewport. Visibility alone can pass while part of a control is clipped. Check both opening and returning to the calling screen.
- Include desktop and phone evidence for the affected state in the review. Use synthetic fixtures for shared screenshots and CI artifacts. Keep screenshots containing live tenant data local. Group findings with the same cause in one pull request and list the entry points and sizes verified.
