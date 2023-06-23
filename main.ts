import { Plugin, App, OpenViewState, Workspace, WorkspaceLeaf, MarkdownView } from "obsidian";
import { around } from 'monkey-around';


export default class OpenInNewTabPlugin extends Plugin {
	uninstallMonkeyPatch: () => void;

	async onload() {
		this.monkeyPatchOpenLinkText();

		this.registerDomEvent(document, "click", this.generateClickHandler(this.app), {
			capture: true,
		});
	}

	onunload(): void {
		this.uninstallMonkeyPatch && this.uninstallMonkeyPatch();
	}

	monkeyPatchOpenLinkText() {
		// This logic is directly pulled from https://github.com/scambier/obsidian-no-dupe-leaves
		// In order to open link clicks in the editor in a new leaf, the only way it seems to be able to do this
		// is by monkey patching the openLinkText method. Not super great, but it works.
		this.uninstallMonkeyPatch = around(Workspace.prototype, {
			openLinkText(oldOpenLinkText) {
				return async function (
					linkText: string,
					sourcePath: string,
					newLeaf?: boolean,
					openViewState?: OpenViewState) {

                                        // If using the homepage plugin, don't conflict with its behaviour
                                        // https://github.com/patleeman/obsidian-open-in-new-tab/pull/9
                                        // Still not merged
					const homepage = this.app.plugins.plugins.homepage;

					if (homepage && homepage.executing) {
						oldOpenLinkText &&
						oldOpenLinkText.apply(this, [
							linkText,
							sourcePath,
							newLeaf,
							openViewState,
						])
						return;
					}

					const fileName = linkText.split("#")?.[0];

					// Detect if we're clicking on a link within the same file. This can happen two ways:
					// [[LinkDemo#Header 1]] or [[#Header 1]]
					const isSameFile = fileName === "" || `${fileName}.md` === sourcePath;

					// Search existing panes and open that pane if the document is already open.
					let fileAlreadyOpen = false
					if (!isSameFile) {
						// Check all open panes for a matching path
						this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
							const viewState = leaf.getViewState()
							const matchesMarkdownFile = viewState.type === 'markdown' && viewState.state?.file?.endsWith(`${fileName}.md`);
							const matchesNonMarkdownFile = viewState.type !== 'markdown' && viewState.state?.file?.endsWith(fileName);

							if (
								matchesMarkdownFile || matchesNonMarkdownFile
							) {
								this.app.workspace.setActiveLeaf(leaf)
								fileAlreadyOpen = true
							}
						})
					}

					let openNewLeaf = true;
					if (isSameFile) {
						// This means it's a link to a heading or block on the same page. e.g. [[#Heading 1]] or [[#^asdf]]. In this case, fall back to the intended behavior passed in. This is necessary to preserve middle mouse button clicks.
						openNewLeaf = newLeaf || false;
					} else if (fileAlreadyOpen) {
						// If the file is already open in another leaf, we set the leaf active above, and we just want the old openLinkText function to handle stuff like highlighting or navigating to a header.
						openNewLeaf = false;
					}

					oldOpenLinkText &&
						oldOpenLinkText.apply(this, [
							linkText,
							sourcePath,
							openNewLeaf,
							openViewState,
						])
				}
			},
		})
	}


	generateClickHandler(appInstance: App) {
		return function (event: MouseEvent) {
			const target = event.target as Element;
			const isNavFile =
				target?.classList?.contains("nav-file-title") ||
				target?.classList?.contains("nav-file-title-content");
			const titleEl = target?.closest(".nav-file-title");

			// Make sure it's just a left click so we don't interfere with anything.
			const pureClick =
				!event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.shiftKey &&
				!event.altKey;

			if (isNavFile && titleEl && pureClick) {
				const path = titleEl.getAttribute("data-path");
				if (path) {
					// This logic is borrowed from the obsidian-no-dupe-leaves plugin
					// https://github.com/patleeman/obsidian-no-dupe-leaves/blob/master/src/main.ts#L32-L46
					let result = false;
					appInstance.workspace.iterateAllLeaves((leaf) => {
						const viewState = leaf.getViewState();
						if (viewState.state?.file === path) {
							appInstance.workspace.setActiveLeaf(leaf);
							result = true;
						}
					});

					// If we have a "New Tab" tab open, just switch to that and let
					// the default behavior open the file in that.
					const emptyLeaves = appInstance.workspace.getLeavesOfType("empty");
					if (emptyLeaves.length > 0) {
						appInstance.workspace.setActiveLeaf(emptyLeaves[0]);
						return;
					}

					if (!result) {
						event.stopPropagation(); // This might break something...
						appInstance.workspace.openLinkText(path, path, true);
					}
				}
			}
		}
	}
}

