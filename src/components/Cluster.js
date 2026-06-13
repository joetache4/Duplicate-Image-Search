function getMixedTokens(path) {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) {
        return path.split("").map((char) => ({ val: char, type: "file" }));
    }

    const dirPart = path.substring(0, lastSlash);
    const filePart = path.substring(lastSlash + 1);

    const dirTokens = dirPart.split("/").map((d) => ({ val: d, type: "dir" }));
    const fileTokens = filePart.split("").map((c) => ({ val: c, type: "file" }));

    // slash indicates the change from dir components to filename components
    const tokens = [...dirTokens, { val: "/", type: "sep" }, ...fileTokens];
	return tokens;
}

function pathDiff(path1, path2) {
    const tokens1 = getMixedTokens(path1);
    const tokens2 = getMixedTokens(path2);

    const diff = Diff.diffArrays(tokens1, tokens2, {
        comparator: (a, b) => a.val === b.val
    });

    let htmlOutput = "";
	let sep = path1.lastIndexOf("/") !== -1 ? "/" : "";

    diff.forEach((part, index) => {
		if (!part.added) {
			const isDiff = part.removed;

			part.value.forEach((token, i) => {
				let content = token.val;

				if (content === "/") {
					sep = "";
				} else {
					const wrappedContent = isDiff ? `<u${sep === "" ? " class='filenameDiff'" : ""}>${content}</u>` : content;
					htmlOutput += (wrappedContent + sep);
				}
			});
		}
    });

    return htmlOutput;
}

const Cluster = {
	props: ["cluster", "clusterIndex", "highlightedIndices", "collapsed"],

	template: `
<div
	:class="{
		'cluster': true,
		'collapsed': collapsed,
	}"
	@mouseup="reset"
	@mouseleave="reset"
>
	<div
		:class="{
			'cluster-num': true,
			'some-selected': cluster.ifiles.length !== highlightedIndices.size && highlightedIndices.size > 0,
			'all-selected': cluster.ifiles.length === highlightedIndices.size,
		}"
		@click="toggleCluster"
	>
		{{ clusterIndex + 1 }}
	</div>
	<div ref="clusterContent" class="cluster-content" @mouseup.left="mouseUpHandler">
		<div class="cluster-imgs">
			<Thumbnail
				v-for="(ifile, fileIndex) in cluster.ifiles"
				:key="ifile.relpath"
				:ifile="ifile"
				:class="{
					'div-img': true,
					'highlighted': highlightedIndices.has(fileIndex),
				}"
				:title="ifile.file.name"
				ref="imgs"
				@mouseenter="mouseenterHandler($event, fileIndex)"
				@mouseleave ="mouseleaveHandler($event, fileIndex)"
				@mousedown.left="mousedownHandler($event, fileIndex)"
				@contextmenu="contextmenuHandler($event, fileIndex)"
			></Thumbnail>
		</div>

		<div class="cluster-info">
			<div
				v-for="(ifile, fileIndex) in cluster.ifiles"
				:key="ifile.relpath"
				:class="{
					'img-info': true,
					'highlighted': highlightedIndices.has(fileIndex),
				}"
				:title="ifile.file.name"
				ref="info"
				@mouseenter="mouseenterHandler($event, fileIndex)"
				@mouseleave ="mouseleaveHandler($event, fileIndex)"
				@mousedown.left="mousedownHandler($event, fileIndex)"
				@contextmenu="contextmenuHandler($event, fileIndex)"
			>
				<span ref="size" :class="['img-info-part', 'size', {'best-part': (parseInt(ifile.file.size/1024) == bestSize) }]">{{ parseInt(ifile.file.size/1024) }}</span>
				<span ref="date" :class="['img-info-part', 'date', {'best-part': (formatDate(new Date(ifile.file.lastModified)) == bestDate) }]">{{ formatDate(new Date(ifile.file.lastModified)) }}</span>
				<span ref="path" :class="['img-info-part', 'path', {'best-part': ifile.relpath.endsWith('.png')}]">{{ ifile.relpath }}</span>
			</div>
		</div>
	</div>
</div>
	`,

	data() {
		return {
			direction           : null,
			ctrlHeldOnMousedown : false,
		}
	},

	mounted() {
		if (this.$refs.info[1]) {
			const path_span1 = this.$refs.info[0].children[2];
			const path_span2 = this.$refs.info[1].children[2];
			path_span1.innerHTML = pathDiff(path_span1.textContent, path_span2.textContent);
			path_span2.innerHTML = pathDiff(path_span2.textContent, path_span1.textContent);
		}
	},

	updated() {
		const path_span1 = this.$refs.info[0].children[2];
		const path_span2 = this.$refs.info.at(-1).children[2];
		path_span2.innerHTML = pathDiff(path_span2.textContent, path_span1.textContent);
	},

	methods: {
		formatDate(d) {
			return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
		},

		reset() {
			this.direction = null;
		},

		mouseenterHandler(event, fileIndex) {
			this.$refs.info[fileIndex].classList.add("hovered");
			this.$refs.imgs[fileIndex].$el.classList.add("hovered");
			const isMouseDown = event.buttons == 1;
			if (isMouseDown) {
				if (this.direction === null) {
					this.direction = !this.highlightedIndices.has(fileIndex);
					this.$emit("highlight", this.direction, this.cluster.ID, fileIndex);
				} else if (this.direction === !this.highlightedIndices.has(fileIndex)) {
					this.$emit("highlight", this.direction, this.cluster.ID, fileIndex);
				}
			}
		},

		mouseleaveHandler(event, fileIndex) {
			this.$refs.info[fileIndex].classList.remove("hovered");
			this.$refs.imgs[fileIndex].$el.classList.remove("hovered");
		},

		mousedownHandler(event, fileIndex) {
			if (event.ctrlKey) {
				event.stopPropagation();
				this.ctrlHeldOnMousedown = true;
				this.$emit("ctrlClick", this.cluster.ifiles[fileIndex]);
			} else {
				this.ctrlHeldOnMousedown = false;
				if (this.direction === null) {
					this.direction = !this.highlightedIndices.has(fileIndex);
					this.$emit("highlight", this.direction, this.cluster.ID, fileIndex);
				}
			}
		},

		mouseUpHandler() {
			if (!this.ctrlHeldOnMousedown) {
				this.$emit("select", this.cluster);
			}
		},

		toggleCluster() {
			this.$emit("toggle", this.cluster.ID);
		},

		contextmenuHandler(event, fileIndex) {
			event.preventDefault(); // prevent default context menu
			event.stopPropagation(); // don't let general context menu show up
			this.$emit("rightClick", event, this.cluster.ID, fileIndex);
		}
	},

	computed: {
		bestSize() {
			let bestVal = null, val = null;
			this.cluster.ifiles.forEach((ifile) => {
				const val = parseInt(ifile.file.size/1024);
				if (bestVal === null || val > bestVal) {
					bestVal = val;
				}
			});
			return bestVal;
		},

		bestDate() {
			let bestVal = null, val = null;
			this.cluster.ifiles.forEach((ifile) => {
				const val = this.formatDate(new Date(ifile.file.lastModified));
				if (bestVal === null || val > bestVal) {
					bestVal = val;
				}
			});
			return bestVal;
		}
	}
}
