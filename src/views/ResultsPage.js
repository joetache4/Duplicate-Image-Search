const ResultsPage = {

	template: `
<div
	id="results-page"
	tabindex="-1"
	@keydown="keyDownHandler"
> <!-- tabindex needed to receive keydown events -->

	<div class="header title-header">
		<h1>Duplicate Image Search</h1>
		<div class="search-buttons">
			<div id="button-pause-search" class="button noselect" v-show="isRunning || isPaused" @click="togglePause">
				{{ isPaused ? "Resume" : "Pause" }}
			</div>
			<div class="button noselect" @click="reloadPage">New Search</div>
		</div>
	</div>

	<div id="results-content">

		<div id="cluster-message" v-show="messageText">{{ messageText }}</div>

		<div
			class="panel"
			@contextmenu="contextmenuHandler($event)"
		>

			<div class="panel-header">
				<div class="progress">
					<div class="progress-bar" v-show="isRunning || isPaused">
						<div ref="progressBar" id="progress-bar-inner"></div>
					</div>
					<div class="progress-text">{{ progressText }}</div>
				</div>

				<div>
					<span
						:class="{
							'text-button': true,
							noselect: true,
							disabled: drawerOpen
						}"
						@click="openDrawer"
					>List Files</span>

					<span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span>
					<span class="noselect">Cluster Span: </span>
					<select name="folder-count" id="folder-count" v-model="clusterSpanState">
						<option value="any" default>Any</option>
						<option value="single">Single Folder</option>
						<option value="multiple">Multiple Folders</option>
					</select>

					<span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span>
					<span class="noselect">Auto-Collapse: </span>
					<select name="auto-collapse" id="auto-collapse" v-model="autoCollapseState">
						<option value="none" default>-</option>
						<option value="any">Any Selected</option>
						<option value="almost-all">All But 1 Selected</option>
					</select>
				</div>
			</div>

			<div
				id="clusters"
				ref="clusters"
				class="clusters noselect"
			>
				<Cluster
					v-for="cluster in $store.state.clusters"
					v-show="clusterIsVisible(cluster)"
					:key="cluster.ID"
					ref="cluster"
					:cluster="cluster"
					:highlightedIndices="highlightedCoords.get(cluster.ID) || new Set()"
					:collapsed="clusterIsCollapsed(cluster)"
					@highlight="highlightHandler"
					@select="selectHandler"
					@toggle="toggleHandler"
					@rightClick="thumbnailRightClickHandler"
					@ctrlClick="thumbnailCtrlClickHandler"
				></Cluster>
			</div>

			<ScrollToTop
				id="cluster-scroll-button"
				class="button noselect"
				:scrollableID="'clusters'"
			></ScrollToTop>
		</div>

		<div
			class="panel sliding-panel"
			:class="{
				open: drawerOpen,
				noselect: !drawerOpen,
			}"
			tabindex="-1"
			@keydown.ctrl.a.prevent="drawerSelectAllHandler"
		>
			<div class="drawer">
				<div class="panel-header">
					<div class="header-strip">
						<span></span>
						<span>
							<span
								class="icon button off noselect emoji-width"
								title="Close"
								@click="closeDrawer"
							>✕</span>
						</span>
					</div>

					<div class="header-strip">
						<span>
							<div
								class="icon button noselect"
								:class="{off: !showHighlightedOnly}"
								id="show-high-option"
								title="Show Highlighted Only"
								@click="showHighlightedOnly = !showHighlightedOnly"
							><span class="monochrome">🖍️</span></div>
							<div
								class="icon button noselect"
								:class="{off: !showHashes}"
								id="show-hash-option"
								title="Show Hashes"
								@click="showHashes = !showHashes"
							><span class="monochrome">ℹ️</span></div>
							<div
								class="icon button noselect"
								:class="{off: !scriptState}"
								id="script-option"
								title="Deletion Script"
								@click="scriptState = !scriptState"
							><span class="monochrome">💻</span></div>
						</span>

						<span>
							<div
								class="icon button off noselect"
								id="copy-action"
								:title="scriptState ? 'Copy Script' : 'Copy List'"
								@click="copyListToClipboard"
							><span class="monochrome">📋</span></div>
							<div
								class="icon button off noselect"
								id="download-action"
								:title="scriptState ? 'Download Script' : 'Download List'"
								@click="downloadList"
							><span class="monochrome">⏬</span></div>
						</span>
					</div>
				</div>

				<div id="file-list" class="textarea" ref="textarea">
					<div
						v-for="(line, index) in scriptHeader"
						:key="index"
						class="line"
					>
						<template
							v-if="line !== ''"
						>
							{{line}}
						</template>
						<template v-else>
							<br>
						</template>
					</div>

					<template
						v-for="(cluster, id) in $store.state.clusters"
						:key="id"
					>
						<div
							v-if="!showHighlightedOnly || highlightedCoords.has(cluster.ID)"
						>
							<template
								v-for="(ifile, fileIndex) in cluster.ifiles"
								:key="fileIndex"
							>
								<div
									v-if="!showHighlightedOnly || highlightedCoords.get(cluster.ID).has(fileIndex)"
									class="line"
									:class="{
										highlighted: highlightedCoords.get(cluster.ID)?.has(fileIndex) ?? false
									}"
									@click.exact="highlightHandler(cluster.ID, fileIndex)"
									@click.alt=scrollToCluster(cluster.ID)
									@click.ctrl=thumbnailCtrlClickHandler(ifile)
								>
									{{formatFileListLine(ifile)}}
								</div>
							</template>
							<div
								v-if="cluster.ID < maxVisibleCluster"
								class="line"
							><br></div>
						</div>
					</template>

					<div
						v-for="(line, index) in scriptFooter"
						:key="index"
						class="line"
					>
						<template
							v-if="line !== ''"
						>
							{{line}}
						</template>
						<template v-else>
							<br>
						</template>
					</div>
				</div>
			</div>

		</div>
	</div>

	<div
		id="context-menu"
		class="context-menu"
		ref="contextMenu"
		v-show="showContextMenu"
		tabindex="-1"
		@focusout="showContextMenu = false"
	>
		<template v-if="contextMenuClusterArg === -1">
			<ul>
				<li @click="selectObvious">Select Obvious</li>
				<li @click="selectVisible(null)">Select All</li>
				<li @click="selectNone">Select None</li>
				<li class="separator noselect" />
				<li @click="collapseVisible">Collapse All</li>
				<li @click="collapseNone">Expand All</li>
			</ul>
		</template>
		<template v-else>
			<ul>
				<li @click="copyFilenameHandler">Copy File Name</li>
				<li @click="selectSameFolderHandler">Select All Files in this Folder</li>
			</ul>
		</template>
	</div>
</div>
`,

	data() {
		return {
			onWindows : navigator.userAgent.toLowerCase().includes("win"),

			clusterSpanState      : "any",
			autoCollapseState     : "none",
			drawerOpen            : false,
			showHighlightedOnly   : false,
			showHashes            : false,
			scriptState           : false,
			highCount             : 0,
			highSize              : 0,
			messageText           : "",
			highlightedCoords     : new Map(),
			collapsedClusters     : new Set(), // might be more performant to have a Map: index -> collapsedState (bool)
			showContextMenu       : false,
			contextMenuClusterArg : -1,
			contextMenuFileArg    : -1,
			mouseX                : 0,
			mouseY                : 0,
		}
	},

	methods: {
		reloadPage() {
			location.reload()
		},

		copyToClipboard(text) {
			navigator.clipboard.writeText(text);
			this.messageText = "Copied to clipboard!";
			setTimeout(() => {
				this.messageText = "";
			}, 1000);
		},

		formatDate(d) {
			return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
		},

		formatBytes(bytes, decimals = 2) {
			if (bytes === 0) return "0 Bytes";

			const k = 1024;
			const dm = decimals < 0 ? 0 : decimals;
			const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
		},

		togglePause() {
			this.isPaused = !this.isPaused;
		},

		thumbnailCtrlClickHandler(ifile) {
			this.copyToClipboard(ifile.file.name);
		},

		highlightHandler(clusterID, fileIndex) {
			let doHighlight = null;

			if (!this.highlightedCoords.has(clusterID)) {
				this.highlightedCoords.set(clusterID, new Set());
				doHighlight = true;
			} else if (!this.highlightedCoords.get(clusterID).has(fileIndex)) {
				doHighlight = true;
			} else {
				doHighlight = false;
			}

			if (doHighlight) {
				this.highlightedCoords.get(clusterID).add(fileIndex);

				this.highCount += 1;
				this.highSize += this.$store.state.clusters[clusterID].ifiles[fileIndex].file.size;
				if (!this.drawerOpen && this.highCount == 1) {
					this.showHighlightedOnly = true;
				}
			} else {
				this.highlightedCoords.get(clusterID).delete(fileIndex);

				this.highCount -= 1;
				this.highSize -= this.$store.state.clusters[clusterID].ifiles[fileIndex].file.size;
				if (!this.drawerOpen && !this.highCount) {
					this.showHighlightedOnly = false;
				}
			}
		},

		selectHandler(cluster) {
			const state = this.autoCollapseState;
			if (state == "none") {
				return;
			}
			let filter = null;
			if (state == "any") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount > 0 && highCount < total;
				}
			} else if (state == "almost-all") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount == total-1;
				}
			}
			if (filter(cluster)) {
				this.collapsedClusters.add(cluster.ID);
			}
		},

		autoCollapseClusters() {
			const state = this.autoCollapseState;
			if (state == "none") {
				return;
			}
			let filter = null;
			if (state == "any") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount > 0 && highCount < total;
				}
			} else if (state == "almost-all") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount == total-1;
				}
			}
			for (const cluster of this.visibleClusters) {
				if (filter(cluster)) {
					this.collapsedClusters.add(cluster.ID);
				}
			}
		},

		toggleHandler(clusterID) {
			if (this.collapsedClusters.has(clusterID)) {
				this.collapsedClusters.delete(clusterID);
			} else {
				this.collapsedClusters.add(clusterID);
			}
		},

		thumbnailRightClickHandler(event, clusterID, fileIndex) {
			this.contextMenuClusterArg = clusterID;
			this.contextMenuFileArg = fileIndex;
			this.mouseX = event.clientX;
			this.mouseY = event.clientY;
			this.showContextMenu = true;
		},

		contextmenuHandler(event) {
			event.preventDefault();
			event.stopPropagation();
			this.mouseX = event.clientX;
			this.mouseY = event.clientY;
			this.showContextMenu = true;
		},

		copyFilenameHandler() {
			const ifile = this.$store.state.clusters[this.contextMenuClusterArg].ifiles[this.contextMenuFileArg];
			this.copyToClipboard(ifile.file.name);
			this.showContextMenu = false;
		},

		selectSameFolderHandler() {
			dirname = path => {
				const parts = path.relpath.split("/");
				parts.pop();
				return parts.join("/");
			}
			const ifile = this.$store.state.clusters[this.contextMenuClusterArg].ifiles[this.contextMenuFileArg];
			const targetDirname = dirname(ifile)
			this.selectVisible(f => {
				return dirname(f) == targetDirname;
			});
			this.showContextMenu = false;
		},

		keyDownHandler(event) {
			if (event.key === "Escape") {
				if (this.showContextMenu) {
					this.showContextMenu = false;
				} else {
					this.drawerOpen = false;
				}
			}
		},

		drawerSelectAllHandler(event) {
			const targetDiv = this.$refs.textarea;
			const range = document.createRange();
			range.selectNodeContents(targetDiv);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		},

		openDrawer() {
			this.drawerOpen = true;
		},

		closeDrawer() {
			this.drawerOpen = false;
		},

		selectObvious() {
			// selects files that match the following criteria:
			// 1. the filename ends with " ?(\d)", " (copy)", or "_\d"
			// 2. there is another file in the same folder that exists without any of these suffixes
			// 3. the other file is the same size
			// 4. the hashes match exactly
			const regex = /(\s\(copy(?:\s\d+)?\)|\s?\(\d+\)|_\d+)(\.[^.]+)?$/;
			filter = (f, cluster) => {
				const strippedName = f.file.name.replace(regex, "$2");
				if (f.file.name == strippedName) {
					return false;
				}
				for (const f2 of cluster.ifiles) {
					if (f2.file.name == strippedName && f2.file.size == f.file.size && f2.hash.equals(f.hash)) {
						return true;
					}
				}
				return false;
			}
			this.selectVisible(filter);
			this.showContextMenu = false;
		},

		selectVisible(filter) {
			for (const cluster of this.visibleClusters) {
				if (!this.highlightedCoords.has(cluster.ID)) {
					this.highlightedCoords.set(cluster.ID, new Set());
				}
				const highlightedFileIndices = this.highlightedCoords.get(cluster.ID);
				for (const [imageIndex, ifile] of cluster.ifiles.entries()) {
					if (!highlightedFileIndices.has(imageIndex)) {
						if (!filter || (filter.length==1 && filter(ifile)) || (filter.length==2 && filter(ifile, cluster))) {
							this.highCount += 1;
							this.highSize += ifile.file.size;
							highlightedFileIndices.add(imageIndex);
						}
					}
				}
			}
			this.autoCollapseClusters();
			this.showContextMenu = false;
		},

		selectNone() {
			this.highCount = 0;
			this.highSize = 0;
			this.highlightedCoords.clear();
			//this.collapseNone();
			this.showContextMenu = false;
		},

		collapseVisible() {
			for (const cluster of this.visibleClusters) {
				this.collapsedClusters.add(cluster.ID);
			}
			this.showContextMenu = false;
		},

		collapseNone() {
			this.autoCollapseState = "none";
			this.collapsedClusters.clear();
			this.showContextMenu = false;
		},

		copyListToClipboardHandler() {
			const onWindows = navigator.userAgent.toLowerCase().includes("win");
			const textContent = this.$refs.textarea.innerText.replace(/(\r?\n){3,}/g, onWindows ? "\r\n\r\n" : "\n\n") + (onWindows ? "\r\n" : "\n");
			this.copyToClipboard(textContent);
		},

		downloadList() {
			const onWindows = navigator.userAgent.toLowerCase().includes("win");
			const textContent = this.$refs.textarea.innerText.replace(/(\r?\n){3,}/g, onWindows ? "\r\n\r\n" : "\n\n") + (onWindows ? "\r\n" : "\n");
			const encoder = new TextEncoder();
			const data = encoder.encode(textContent);
			const ext = this.scriptState ? (onWindows ? "bat" : "sh") : "txt";
			const filename = `${this.scriptState ? "delete" : "selected"}-duplicates-${this.formatDate(new Date())}.${ext}`;
			const type = this.scriptState ? (onWindows ? "application/octet-stream" : "application/x-sh") : "text/plain";
			const file = new Blob([data], {type: type});
			if (window.navigator.msSaveOrOpenBlob) { // IE10+
				window.navigator.msSaveOrOpenBlob(file, filename);
			} else { // Others
				const a = document.createElement("a"),
				url = URL.createObjectURL(file);
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				setTimeout(() => {
					document.body.removeChild(a);
					window.URL.revokeObjectURL(url);
				}, 0);
			}
		},

		clusterIsVisible(cluster) {
			if (this.clusterSpanState == "any") {
				return true;
			}
			const folderCount = new Set(
				cluster.ifiles
				.map(item => {
					const parts = item.relpath.split("/");
					parts.pop();
					return parts.join("/");
				})
				.filter(folderPath => folderPath !== "")
			).size;
			const clusterSpan = folderCount === 1 ? "single" : "multiple";
			if (clusterSpan == this.clusterSpanState) {
				return true;
			}
			return false;
		},

		clusterIsCollapsed(cluster) {
			return this.collapsedClusters.has(cluster.ID)
		},

		scrollToCluster(clusterID) {
			const container = this.$refs.clusters;
			const target = document.getElementsByClassName("cluster")[clusterID];

			container.scrollTo({
				top: target.offsetTop - container.offsetTop - 30,
				behavior: "smooth"
			});
		},

		formatFileListLine(ifile) {
			let path = ifile.relpath;
			if (this.onWindows) {
				path = path.replaceAll("/", "\\");
			}
			if (this.scriptState) {
				if (this.onWindows) {
					path = "del \"" + path.replaceAll("\"", "\\\"") + "\"";
				} else {
					path = "rm \"" + path.replaceAll("\"", "\\\"") + "\"";
				}
			} else if (this.showHashes) {
				const hash = parseInt(ifile.hash.bitstring, 2).toString(16).padStart(16, "0");
				path = hash + " " + path;
			}
			return path
		},
	},

	computed: {
		scriptHeader() {
			const text = [];
			if (this.scriptState) {
				if (this.onWindows) {
					text.push("chcp 65001 > nul"); // run script with UTF-8 encoding
					text.push("");

				} else {
					text.push("#!/bin/bash");
					text.push("");
				}
			}
			return text
		},

		scriptFooter() {
			const text = [];
			if (this.scriptState) {
				if (this.onWindows) {
					text.push("");
					text.push("pause");
				}
			}
			return text
		},

		visibleClusters() {
			if (this.clusterSpanState == "any") {
				return this.$store.state.clusters;
			}

			clusterSpan = (cluster) => {
				const folderCount = new Set(
					cluster.ifiles
					.map(item => {
						const parts = item.relpath.split("/");
						parts.pop();
						return parts.join("/");
					})
					.filter(folderPath => folderPath !== "")
				).size;
				return folderCount === 1 ? "single" : "multiple";
			}

			return this.$store.state.clusters.filter(cluster => {
				return clusterSpan(cluster) == this.clusterSpanState;
			});
		},

		maxVisibleCluster() {
			if (this.showHighlightedOnly) {
				return Math.max(...this.highlightedCoords.keys());
			} else {
				return this.$store.state.clusters.length - 1;
			}
		},

		isInitializing() {
			return this.$store.getters.isInitializing;
		},

		isRunning() {
			return this.$store.getters.isRunning;
		},

		isPaused: {
			get() {
				return this.$store.getters.isPaused;
			},
			set(val) {
				if (!this.isEnded && !this.isInitializing) {
					this.$store.commit("SET_SEARCH_STATE", val ? "search_paused" : "search_running");
				}
			}
		},

		isEnded() {
			return this.$store.getters.isEnded;
		},

		percentDone() {
			const n = this.$store.state.progress;
			const t = this.$store.state.progressTotal;
			let pct = Math.floor(100 * n / t);
			if (pct < 5) {
				pct = 5;
			}
			return pct;
		},

		progressText() {
			const m = this.$store.state.exactMatch ? "Exact Search" : "Perceptual Search";
			const c = this.$store.state.clusters.length;
			const n = this.$store.state.progress;
			const t = this.$store.state.progressTotal;
			const h = this.highCount;
			const s = this.formatBytes(this.highSize);
			if (this.isInitializing) {
				const i = this.$store.state.inputCount;
				return `Initializing: Found ${i} files so far...`;
			}
			else if (this.isEnded) {
				const clusterInfo = `${m}: Found ${c} cluster${c == 1 ? "" : "s"}  in ${t} file${t == 1 ? "" : "s"}.`;
				const selectedInfo = ` Selected ${h} file${h == 1? "" : "s"} (${s}).`;
				return h ? clusterInfo + selectedInfo : clusterInfo;
			} else {
				return `${m}: Reading file ${n} of ${t}. Found ${c} cluster${c == 1 ? "" : "s"} so far.`;
			}
		},

		resultsText() {
			if (this.$store.state.searchStatus != "search_ended") {
				return null;
			}
			if (this.$store.state.clusters.length == 0) {
				if (this.$store.state.mustMatch && this.$store.state.progressTotal == 0) {
					return "The chosen folder does not contain any images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
				} else if (!this.$store.state.mustMatch && this.$store.state.progressTotal <= 1) {
					return "The chosen folder does not contain two or more images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
				} else {
					return "No duplicates found.";
				}
			} else {
				return "";
			}
		},
	},

	watch: {
		autoCollapseState(newState) {
			if (newState == "none") {
				return;
			}
			this.collapsedClusters.clear();
			this.autoCollapseClusters();
		},

		percentDone(pct) {
			this.$refs.progressBar.style.width = "".concat(pct, "%");
		},

		resultsText(msg) {
			this.messageText = msg;
		},

		showContextMenu(newState) {
			if (newState) {
				this.$nextTick(() => {
					const contextMenu = this.$refs.contextMenu;
					const menuWidth = contextMenu.offsetWidth;
					const menuHeight = contextMenu.offsetHeight;
					const windowWidth = document.documentElement.clientWidth;
					const windowHeight = document.documentElement.clientHeight;

					if ((this.mouseX + menuWidth) > windowWidth - 10) {
						contextMenu.style.left = `${windowWidth - menuWidth - 10}px`;
					} else {
						contextMenu.style.left = `${this.mouseX}px`;
					}

					if ((this.mouseY + menuHeight) > windowHeight - 10) {
						contextMenu.style.top = `${windowHeight - menuHeight - 10}px`;
					} else {
						contextMenu.style.top = `${this.mouseY}px`;
					}

					contextMenu.focus();
				});
			} else {
				this.$el.focus();
				this.contextMenuClusterArg = -1;
				this.contextMenuFileArg = -1;
			}
		},
	}
}
