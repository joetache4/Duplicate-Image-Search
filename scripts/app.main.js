const allClusters = document.getElementById("clusters");
const progressBar = document.getElementById("progress-bar-inner");

const Config = {
	pause             : false,
	fastRead          : false,
	thumbnailQuality  : 0.6,
	thumbnailMaxDim   : 160,
};

const Results = {
	filecount           : 0,
	supportedImgCount   : 0,
	clusters            : [],
	clusterCount        : 0,
	highlighted         : 0,
};

class ImageFile {
	static formats           = ["image/jpg", "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

	static thumbReadLimit    = 80*1024;
	static maxFileSize       = 40*1024*1024;

	static iconDim           = 11;   // Images will be processed into icons of this side length

	static ratioTolerancePct = 10;
	static acceptLumaDist    = 2;    // Images will be considered similar if there luma distance is within this threshold
	static rejectLumaDist    = 500;  // Images will be considered distinct if there luma distance is outside this threshold
	static rejectChromaDist  = 1000; // Images will be considered distinct if there chroma distance is outside this threshold
	                                 // Otherwise, Images are considered similar

	static {
		// Images will be treated as grids of "blocks", each containing "cells". Each cell is a pixel.
		ImageFile.iconArea = ImageFile.iconDim ** 2;
		ImageFile.blockDim = 2 * ImageFile.iconDim + 1;
		ImageFile.cellDim  = ImageFile.iconDim + 1;

		if ((ImageFile.blockDim-2)%3 != 0) {
			throw new Error("Invalid iconDim");
		}

		ImageFile.canvasDim = ImageFile.blockDim * ImageFile.cellDim; // Images will be loaded as squares with this side length

		ImageFile.reader  = new FileReader();
		ImageFile.img     = new Image();
		ImageFile.canvas  = document.createElement("canvas");
		ImageFile.context = ImageFile.canvas.getContext("2d", { willReadFrequently: true });

		ImageFile.canvas.width  = ImageFile.canvasDim;
		ImageFile.canvas.height = ImageFile.canvasDim;

		ImageFile.acceptLumaDist   *= ImageFile.iconArea;
		ImageFile.rejectLumaDist   *= ImageFile.iconArea;
		ImageFile.rejectChromaDist *= ImageFile.iconArea;
	}

	constructor(file) {
		this.file       = file;
		this.val        = null;
		this.width      = null;
		this.height     = null;
		this.icon       = null;
		this.clusterID  = null;
	}

	valid() {
		if (this.val === null) {
			this.val = ImageFile.formats.includes(this.file.type) && this.file.size <= ImageFile.maxFileSize;
		}
		return this.val;
	}

	load(firstAttempt = true) {
		if (firstAttempt && Config.fastRead && this.file.type == "image/jpeg") {

			this.readThumbnail(function(data) {
				if (data == null) {
					this.load(false);
				} else {

					ImageFile.img.onload = function() {
						this.icon   = ImageFile.icon();
						this.width  = ImageFile.img.width;
						this.height = ImageFile.img.height;
						URL.revokeObjectURL(ImageFile.img.src);
						this.onload();
					}.bind(this);

					ImageFile.img.onerror = function() {
						URL.revokeObjectURL(ImageFile.img.src);
						this.load(false);
					}.bind(this);

					ImageFile.img.src = URL.createObjectURL(data);
				}
			}.bind(this));
		} else {

			ImageFile.reader.onload = function(evt) {

				ImageFile.img.onload = function() {
					this.icon   = ImageFile.icon();
					this.width  = ImageFile.img.width;
					this.height = ImageFile.img.height;
					this.onload();
				}.bind(this);

				ImageFile.img.onerror = function() {
					this.val = false;
					this.onerror();
				}.bind(this);

				ImageFile.img.src = evt.target.result; // TODO slow
			}.bind(this);

			ImageFile.reader.onerror = function() {
				this.val = false;
				this.onerror();
			}.bind(this);

			ImageFile.reader.readAsDataURL(this.file);
		}
	}

	readThumbnail(callback) {
		ImageFile.reader.onload = function(evt) {
			const arr = new Uint8Array(evt.target.result);
			let lo, hi;
			for (let i = 2; i < arr.length; i++) {
				if (arr[i] == 0xFF) {
					if (!lo) {
						if (arr[i + 1] == 0xD8) {
							lo = i;
						}
					} else {
						if (arr[i + 1] == 0xD9) {
							hi = i + 2;
							break;
						}
					}
				}
			}
			if (lo && hi) {
				console.log("thumbnail read: " + this.file.name);
				callback(new Blob([arr.subarray(lo, hi)], {type:"image/jpeg"}));
			} else {
				callback(null);
			}
		}.bind(this);

		ImageFile.reader.onerror = function() {
			callback(null);
		}.bind(this);

		ImageFile.reader.readAsArrayBuffer(this.file.slice(0, ImageFile.thumbReadLimit));
	}

	/*
	static icon_test() {
		ImageFile.context.drawImage(ImageFile.img, 0, 0, ImageFile.iconDim, ImageFile.iconDim);
		let data = ImageFile.context.getImageData(0, 0, ImageFile.iconDim, ImageFile.iconDim).data;

		let YBR = [[], [], []];
		let r = 0, g = 0, b = 0;

		for (let i = 0; i < ImageFile.iconDim**2; i++) {
			r = data[4*i  ];
			g = data[4*i+1];
			b = data[4*i+2];
			// convert RGB to YCbCr
			YBR[0][i] = 0.299000 * r + 0.587000 * g + 0.114000 * b;
			YBR[1][i] = 128 - 0.168736 * r - 0.331264 * g + 0.500000 * b;
			YBR[2][i] = 128 + 0.500000 * r - 0.418688 * g - 0.081312 * b;
		}
		return [ImageFile.normalize(YBR[0]), ImageFile.normalize(YBR[1]), ImageFile.normalize(YBR[2])];
	}
	*/

	static icon() {
		ImageFile.context.drawImage(ImageFile.img, 0, 0, ImageFile.canvasDim, ImageFile.canvasDim); // TODO very slow
		let data = ImageFile.context.getImageData(0, 0, ImageFile.canvasDim, ImageFile.canvasDim).data; // TODO slow
		//data = ImageFile.rgbaToYcbcr(data); // there is slightly less float instability when this is performed before the box blur, but it is negligible
		data = ImageFile.boxBlur(data, ImageFile.canvasDim, ImageFile.canvasDim, ImageFile.cellDim, ImageFile.cellDim);
		data = ImageFile.boxBlur(data, ImageFile.blockDim, ImageFile.blockDim, 3, 2);
		data = ImageFile.rgbaToYcbcr(data); // performing the conversion here avoids a lot of float arithmetic and can separate into channels
		data = [ImageFile.normalize(data[0]), ImageFile.normalize(data[1]), ImageFile.normalize(data[2])];
		return data;
	}

	/*
	static rgbaToYcbcr(data) {
		// see ITU-T T.871
		let YBR = new Array(data.length*3/4);
		let r = 0, g = 0, b = 0;
		for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
			let r = data[i  ];
			let g = data[i+1];
			let b = data[i+2];
			YBR[j  ] =       0.2990000000 * r + 0.5870000000 * g + 0.1140000000 * b;
			YBR[j+1] = 128 - 0.1687358916 * r - 0.3312641084 * g + 0.5000000000 * b;
			YBR[j+2] = 128 + 0.5000000000 * r - 0.4186875892 * g - 0.0813124108 * b;
		}
		return YBR;
	}
	*/

	static rgbaToYcbcr(data, channelsIn=4) {
		// see ITU-T T.871
		const YBR = [[], [], []];
		let r = 0, g = 0, b = 0;

		for (let i = 0; i < ImageFile.iconArea; i++) {
			r = data[channelsIn*i    ];
			g = data[channelsIn*i + 1];
			b = data[channelsIn*i + 2];
			YBR[0][i] =       0.2990000000 * r + 0.5870000000 * g + 0.1140000000 * b;
			YBR[1][i] = 128 - 0.1687358916 * r - 0.3312641084 * g + 0.5000000000 * b;
			YBR[2][i] = 128 + 0.5000000000 * r - 0.4186875892 * g - 0.0813124108 * b;
		}

		return YBR;
	}

	static boxBlur(data, width, height, windowDim, shift, channelsIn=4) {
		const blurredData = new Array(data.length);
		const destDim = parseInt((width-windowDim)/shift) + 1;
		const n = windowDim ** 2;
		let sumR = 0, sumG = 0, sumB = 0;
		let i = 0, j = 0;

		for (let shiftRow = 0; shiftRow <= width-windowDim; shiftRow += shift) {
			for (let shiftCol = 0; shiftCol <= height-windowDim; shiftCol += shift) {
				sumR = 0, sumG = 0, sumB = 0;
				for (let row = 0; row < windowDim; row++) {
					for (let col = 0; col < windowDim; col++) {
						i = channelsIn * ((row + shiftRow) * width + (col + shiftCol));
						sumR += data[i    ];
						sumG += data[i + 1];
						sumB += data[i + 2];
					}
				}
				blurredData[j    ] = sumR / n;
				blurredData[j + 1] = sumG / n;
				blurredData[j + 2] = sumB / n;
				j += channelsIn;
			}
		}

		return blurredData;
	}

	static normalize(vals) {
		let max  = 0;
		let min  = Number.POSITIVE_INFINITY;
		for (let i = 0; i < vals.length; i++) {
			if (vals[i] > max) {
				max = vals[i];
			} else if (vals[i] < min) {
				min = vals[i];
			}
		}

		let norm = null;
		let range = max - min;
		if (range < 0.00001) {
			norm = new Array(vals.length).fill(vals[0]);
		} else {
			norm = vals.map(val => (val - min) * 255 / range);
		}
		return norm;
	}

	similar(other) {
		const icon1 = this.icon, icon2 = other.icon;
		const w1 = this.width, w2 = other.width;
		const h1 = this.height, h2 = other.height;

		let dist  = 0;

		// abs(ratio1 - ratio2) > tol% * max(ratio1, ratio2)  -->  reject
		if (Math.abs(100*h1*w2 - 100*h2*w1) > Math.max(h1*w2, h2*w1) * ImageFile.ratioTolerancePct) {
			return false;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[0][i] - icon2[0][i]) ** 2;
		}
		if (dist > ImageFile.rejectLumaDist) {
			return false;
		}

		if (dist < ImageFile.acceptLumaDist) {
			return true;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[1][i] - icon2[1][i]) ** 2;
		}
		if (dist > ImageFile.rejectChromaDist) {
			return false;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[2][i] - icon2[2][i]) ** 2;
		}
		if (dist > ImageFile.rejectChromaDist) {
			return false;
		}

		return true;
	}

	onload() {}
	onerror() {}
}



// typeof files === "FileList"
function startSearch(files) {
	Config.fastRead = document.getElementById("fast-option").checked;

	document.querySelector(".options-page").style.display = "none";
	document.querySelector(".header").style.display = "block";
	allClusters.style.display = "block";

	files = Array.from(files);
	files.reverse();
	Results.filecount = files.length;
	processNext(files);
}

function processNext(files, scannedFiles=null, n=0) {
	if (files.length == 0) {
		updateUISearchDone();
		return;
	}
	if (Config.pause) {
		setTimeout(processNext, 1000, files, scannedFiles, n);
		return;
	}
	if (scannedFiles == null) {
		scannedFiles = [];
	}

	n++;
	updateProgress(n);

	let ifile = new ImageFile(files.pop());

	if (!ifile.valid()) {
		processNext(files, scannedFiles, n);
		return;
	}

	Results.supportedImgCount++;

	ifile.onload = function() {
		searchForMatch(ifile, scannedFiles);
		scannedFiles.push(ifile);
		processNext(files, scannedFiles, n);
	};

	ifile.onerror = function() {
		processNext(files, scannedFiles, n);
	};

	ifile.load();
}

function searchForMatch(ifile, scannedFiles) {
	for (let ifile2 of scannedFiles) {
		if (ifile2.valid() && ifile.similar(ifile2)) {
			groupTogether(ifile, ifile2);
			break;
		}
	}
}

function groupTogether(ifile1, ifile2) {
	const i = ifile1.clusterID;
	const j = ifile2.clusterID;

	if (i == null && j == null) {
		ifile1.clusterID = Results.clusterCount;
		ifile2.clusterID = Results.clusterCount;
		Results.clusters.push([ifile1, ifile2]);
		Results.clusterCount++;
		createClusterDivs(Results.clusterCount - 1);
		addToCluster(Results.clusterCount - 1, ifile1);
		addToCluster(Results.clusterCount - 1, ifile2);
		return;
	}

	if (typeof i === "number") {
		Results.clusters[i].push(ifile2);
		ifile2.clusterID = i;
		addToCluster(i, ifile2);
		return;
	}

	if (typeof j === "number") {
		Results.clusters[j].push(ifile1);
		ifile1.clusterID = j;
		addToCluster(j, ifile1);
		return;
	}
}

function addToCluster(clusterIndex, ifile) {
	const divClusterImgs = document.querySelectorAll(".cluster-imgs")[clusterIndex];
	const divClusterInfo = document.querySelectorAll(".cluster-info")[clusterIndex];

	const divImg = createChildDiv("div-img", divClusterImgs);
	const thumb = new Image();
	thumb.classList.add("cluster-img");
	thumb.title = ifile.file.webkitRelativePath;
	divImg.appendChild(thumb);
	const divImgDims = createChildDiv("image-dims", divImg);
	createThumbnail(ifile.file, thumb, divImgDims);

	const divImgInfo = createChildDiv("img-info", divClusterInfo);
	const divImgSize = createChildSpan("img-info-part size", divImgInfo);
	const divImgDate = createChildSpan("img-info-part date", divImgInfo);
	const divImgPath = createChildSpan("img-info-part path", divImgInfo);
	divImgSize.textContent = parseInt(ifile.file.size/1024);
	divImgDate.textContent = formatDate(new Date(ifile.file.lastModified));
	divImgPath.textContent = ifile.file.webkitRelativePath;

	// alphabetize images by path name
	tmp = Array.from(divClusterImgs.children)
	tmp.sort((a,b) => {
		textA = a.children[0].title;
		textB = b.children[0].title;
		return textA.localeCompare(textB);
	});
	divClusterImgs.innerHTML = "";
	tmp.forEach(child => divClusterImgs.appendChild(child));
	
	// alphabetize path names
	tmp = Array.from(divClusterInfo.children)
	tmp.sort((a,b) => {
		textA = a.querySelector(".path").textContent;
		textB = b.querySelector(".path").textContent;
		return textA.localeCompare(textB);
	});
	divClusterInfo.innerHTML = "";
	tmp.forEach(child => divClusterInfo.appendChild(child));

	hoverFunc = () => {
		divImgInfo.classList.toggle("hovered");
		divImg.classList.toggle("hovered");
	}
	highlightFunc = () => {
		divImgInfo.classList.toggle("highlighted");
		divImg.classList.toggle("highlighted");
		if (divImgInfo.classList.contains("highlighted")) {
			Results.highlighted++;
		} else {
			Results.highlighted--;
		}
	}
	divImgInfo.addEventListener("mouseover", hoverFunc);
	divImg.addEventListener("mouseover", hoverFunc);
	divImgInfo.addEventListener("mouseout", hoverFunc);
	divImg.addEventListener("mouseout", hoverFunc);
	divImgInfo.addEventListener("click", highlightFunc);
	divImg.addEventListener("click", highlightFunc);

	let parts = divClusterInfo.querySelectorAll(".img-info-part.size");
	let bestPart = null, bestVal = 0, val = null;
	parts.forEach((part) => {
		val = parseInt(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = parseInt(part.textContent)
		if (val == bestVal) {
			part.classList.add("best-part");
		}
	});

	parts = divClusterInfo.querySelectorAll(".img-info-part.date");
	bestPart = null, bestVal = new Date(0), val = null;
	parts.forEach((part) => {
		val = new Date(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = new Date(part.textContent)
		if (val.getTime() === bestVal.getTime()) {
			part.classList.add("best-part");
		}
	});
}

function createThumbnail(file, thumb, divImgDims) {
	let reader = new FileReader();
	reader.onload = function(evt) {
		let img = new Image();
		let canvas = document.createElement("canvas");
		let context = canvas.getContext("2d", { willReadFrequently: true });
		img.onload = function() {
			divImgDims.textContent = "".concat(img.width, "×", img.height);
			if (img.width >= img.height) {
				canvas.height = Config.thumbnailMaxDim * 2;
				canvas.width = Math.floor(img.width * canvas.height / img.height);
			} else {
				canvas.width = Config.thumbnailMaxDim * 2;
				canvas.height = Math.floor(img.height * canvas.width / img.width);
			}
			thumb.width = canvas.width / 2;
			thumb.height = canvas.height / 2;
			context.drawImage(img, 0, 0, canvas.width, canvas.height);
			thumb.src = canvas.toDataURL("image/jpeg", Config.thumbnailQuality); // somewhat slow
			canvas  = null;
			context = null;
			img     = null;
			reader  = null;
		};
		img.src = evt.target.result; // TODO slow
	};
	reader.readAsDataURL(file);
}









function updateText(element, text) {
	document.querySelector(element).textContent = text;
}

function createChildDiv(className, parent) {
	const element = document.createElement("div");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function createChildSpan(className, parent) {
	const element = document.createElement("span");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function formatDate(d){
	return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
}

function createClusterDivs(clusterIndex) {
	const a = createChildDiv("cluster", allClusters);
	const b = createChildDiv("cluster-num", a);
	b.textContent = clusterIndex + 1;
	const c = createChildDiv("cluster-content", a);
	createChildDiv("cluster-imgs", c);
	createChildDiv("cluster-info", c);
	b.addEventListener("click", () => {
		c.classList.toggle("hidden");
	});
}

function checkBrowser() {
	const selected = document.getElementById("input-files");
	if (!selected.webkitdirectory) {
		alert("This browser does not support folder selection.");
		return;
	}
	selected.click();
}

function updateLocalStorage() {
	localStorage.setItem("fast-option", document.getElementById("fast-option").checked);
	return;
}

function updateUIOptions() {
	if (localStorage.getItem("fast-option") == null) {
		document.getElementById("fast-option").checked = true;
		return;
	}
	if (localStorage.getItem("fast-option") == "false") {
		document.getElementById("fast-option").checked = false;
	} else {
		document.getElementById("fast-option").checked = true;
	}
	return;
}

function clickCheckbox(event) {
	if (event.target.tagName != 'INPUT') {
		document.getElementById('fast-option').click();
	}
}

function updateUISearchPending() {
	setTimeout(() => {
		document.getElementById("cancel-button").style.display = "inline-block";
		document.getElementById("file-selector").style.display = "none";
	}, 500);

}

function updateUISearchDone() {
	document.getElementById("button-pause-search").style.display = "none";
	const progress = document.querySelector(".progress");
	progress.removeChild(progress.querySelector(".progress-bar"));
	let s = "s", s2 = "s";
	if (Results.supportedImgCount == 1) {
		s = "";
	}
	if (Results.clusterCount == 1) {
		s2 = "";
	}
	updateText(".progress-text", "Successfully scanned ".concat(Results.supportedImgCount, " file", s, ". Found ", Results.clusterCount, " cluster", s2, "."));
	if (Results.clusterCount == 0) {
		updateText(".progress-text", "Zero similar images found from the successfully scanned ".concat(Results.supportedImgCount, " file", s, "."));
		if (Results.supportedImgCount < 2) {
			document.getElementById("message").textContent = "The selected folder does not contain at least 2 images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
		} else {
			document.getElementById("message").textContent = "No duplicates found.";
		}
		document.getElementById("message").style.display = "block";
		allClusters.style.display = "none";
	}
	return;
}

function updateProgress(n) {
	let s = "s";
	if (Results.clusterCount == 1) {
		s = "";
	}
	updateText(".progress-text", "Please wait... Reading file ".concat(n, " of ", Results.filecount, ". Found ", Results.clusterCount, " cluster", s, " so far."));
	let pct = Math.floor(100 * n / Results.filecount);
	if (pct < 5) {
		pct = 5;
	}
	progressBar.style.width = "".concat(pct, "%");
}

function showAllList() {
	let text = "";
	for (let cluster of Results.clusters) {
		for (let ifile of cluster) {
			text = text.concat(ifile.file.webkitRelativePath, "\n");
		}
		text = text.concat("\n");
	}
	text = text.trimEnd();
	document.querySelector(".textarea").value = text;
	toggleList();
}

function showHighlightedList() {
	let text = "";
	for (let cluster of allClusters.querySelectorAll(".cluster")) {
		let paths = cluster.querySelectorAll(".highlighted.img-info > .path");
		if (paths.length) {
			for (let path of paths) {
				text = text.concat(path.textContent, "\n");
			}
			text = text.concat("\n");
		}
	}
	text = text.trimEnd();

	document.querySelector(".textarea").value = text;
	toggleList();
}

function toggleList() {
	document.querySelector(".textarea").classList.toggle("textareaon");
	document.getElementById("show-all-button").classList.toggle("hidden");
	document.getElementById("show-high-button").classList.toggle("hidden");
	document.getElementById("close-button").classList.toggle("hidden");
	document.getElementById("copy-button").classList.toggle("hidden");
	document.getElementById("save-button").classList.toggle("hidden");
}

function copyListToClipboard() {
	const text = document.querySelector(".textarea").value;
	navigator.clipboard.writeText(text);
	document.getElementById("message").textContent = "Copied to clipboard!";
	document.getElementById("message").style.display = "block";
	setTimeout(function() {
		document.getElementById("message").style.display = "none";
	}, 1000);
}

function downloadList() {
	const data = document.querySelector(".textarea").value;
	const filename = `selected-duplicates-${formatDate(new Date())}.txt`;
	const type = "text/plain";
	const file = new Blob([data], {type: type});
		if (window.navigator.msSaveOrOpenBlob) // IE10+
			window.navigator.msSaveOrOpenBlob(file, filename);
	else { // Others
		const a = document.createElement("a"),
		url = URL.createObjectURL(file);
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		setTimeout(function() {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 0);
	}
}

function togglePause() {
	Config.pause = !Config.pause;
	if (document.getElementById("button-pause-search").textContent == "Pause") {
		document.getElementById("button-pause-search").textContent = "Resume";
	} else {
		document.getElementById("button-pause-search").textContent = "Pause";
	}
}

function reloadPage() {
	location.reload();
}

window.addEventListener("DOMContentLoaded", () => {
	updateUIOptions();
	window.scrollTo({top: 0});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && document.querySelector(".textarea").classList.contains("textareaon")) {
			toggleList();
		}
	});

	document.getElementById("input-files").addEventListener("cancel", () => {
		document.getElementById("cancel-button").style.display = "none";
		document.getElementById("file-selector").style.display = "inline-block";
	});
});