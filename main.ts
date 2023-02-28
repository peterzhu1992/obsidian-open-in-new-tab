import { Plugin, App, OpenViewState, Workspace, WorkspaceLeaf } from "obsidian";
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
					_?: boolean,
					openViewState?: OpenViewState) {
					// Search existing panes and open that pane if the document is already open.
					let result = false
					// Check all open panes for a matching path
					this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
						const viewState = leaf.getViewState()
						const matchesMarkdownFile = viewState.type === 'markdown' && viewState.state?.file === `${linkText}.md`;
						const matchesNonMarkdownFile = viewState.type !== 'markdown' && viewState.state?.file === linkText;
						if (
							matchesMarkdownFile || matchesNonMarkdownFile
						) {
							this.app.workspace.setActiveLeaf(leaf)
							result = true
						}
					})

					if (!result) {
						result =
							oldOpenLinkText &&
							oldOpenLinkText.apply(this, [
								linkText,
								sourcePath,
								true, // Always open a new leaf
								openViewState,
							])
					}

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
