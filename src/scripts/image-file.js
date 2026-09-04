class ImageFile {

	static formats           = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
	static ratioTolerancePct = 10;   // Image aspect ratios may differ by up to 10% before comparing
	static maxFileSize       = 40*1024*1024;
	static thumbnailQuality  = 0.6;
	static thumbnailMaxDim   = 200;

	constructor(file) {
		this.file       = file;
		this.relpath    = file.fullRelativePath || file.webkitRelativePath || file.name; // webkitRelativePath is "" for top-level dropped files
		this.depth      = this.relpath.split("/").length-1; // Forward-slash is used on Windows, too
		this.type       = null;
		this.valid      = null;
		this.width      = null;
		this.height     = null;
		this.hash       = null;
		this.clusterID  = null;
		this.thumbStart = null;
		this.thumbEnd   = null;

		// type is "" for dropped files inside folders
		const i = file.name.lastIndexOf(".");
		this.type = i == -1 ? "" : file.name.substring(i+1);
		if (this.type === "jpg") {
			this.type = "jpeg";
		}
	}

	isValid() {
		if (this.valid === null) {
			this.valid = ImageFile.formats.includes(this.type) && this.file.size <= ImageFile.maxFileSize;
		}
		return this.valid;
	}

	async load(fastRead, exactMatch, phash=DHash) {
		if (!exactMatch && fastRead && this.type === "jpeg") {
			try {
				const data = await this.readThumbnail();
				if (data) {
					this.hash = await phash.fromBlob(data);
					return;
				}
			} catch (error) {
				console.log("failed to read thumbnail: " + this.relpath);
			}
		}

		if (exactMatch) {
			const arrayBuffer = await this.file.arrayBuffer();
			const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
			this.hash = hash;
			return;

		} else {
			try {
				this.hash = await phash.fromBlob(this.file);
				this.width  = this.hash.width;
				this.height = this.hash.height;
			} catch (error) {
				console.log("corrupt image: " + this.relpath);
				this.valid = false;
			}
		}
	}

	isSimilar(other, exactMatch) {
		if (exactMatch) {
			return this.hash == other.hash;
		} else {
			const w1 = this.width,  w2 = other.width;
			const h1 = this.height, h2 = other.height;
			// abs(ratio1 - ratio2) > tol% * max(ratio1, ratio2)  -->  reject
			if (Math.abs(100*h1*w2 - 100*h2*w1) > Math.max(h1*w2, h2*w1) * ImageFile.ratioTolerancePct) {
				return false;
			}
			if (!this.hash.isSimilar(other.hash)) {
				return false;
			}
			return true;
		}
	}

	async readThumbnail() {
		const reader = new FileReader();

		let bytes = null;
		try {
			bytes = await new Promise((resolve, reject) => {
				reader.readAsArrayBuffer(this.file.slice(0, 80*1024));
				reader.onerror = reject;
				reader.onload = (evt) => {
					resolve(new Uint8Array(evt.target.result));
				}
			});
		} catch(error) {
			return null;
		} finally {
			reader.onload = null;
			reader.onerror = null;
		}

		let lo, hi;
		for (let i = 0; i < bytes.length; ) {
			while(bytes[i] == 0xFF) i++;
			let marker = bytes[i];  i++;
			if (0xD0 <= marker && marker <= 0xD7) continue; // RST
			if (marker == 0xD8) continue; // SOI
			if (marker == 0xD9) break;    // EOI
			if (marker == 0x01) continue; // TEM
			if (marker == 0x00) continue; // escaped 0xFF byte
			const len = (bytes[i]<<8) | bytes[i+1];  i+=2;
			if (marker == 0xE1) { // APP1
				if (bytes[i] == 0x45 && bytes[i+1] == 0x78 && bytes[i+2] == 0x69 && bytes[i+3] == 0x66 && bytes[i+4] == 0x00 && bytes[i+5] == 0x00) { // EXIF header
					// search for embedded image
					for (let j = i+6; j < i+len-2; j++) {
						if (bytes[j] == 0xFF) {
							if (!lo) {
								if (bytes[j + 1] == 0xD8) {
									lo = j;
								}
							} else {
								if (bytes[j + 1] == 0xD9) {
									hi = j + 2;
									break;
								}
							}
						}
					}
				}
			}
			if (marker == 0xC0) {
				this.height = (bytes[i+1]<<8) | bytes[i+2];
				this.width  = (bytes[i+3]<<8) | bytes[i+4];
				break;
			}
			i+=len-2;
		}
		if (lo && hi && this.height && this.width) {
			console.log("thumbnail read: " + this.file.name);
			this.thumbStart = lo;
			this.thumbEnd   = hi;
			return new Blob([bytes.slice(lo, hi)], {type:"image/jpeg"}); // bytes.subarray will create a "view" into bytes that prevents GC
		} else {
			return null;
		}
	}

	async createThumbnail(canvas) {
		const dpr = window.devicePixelRatio || 1;
		const blob = this.thumbStart && this.thumbEnd ? this.file.slice(this.thumbStart, this.thumbEnd) : this.file;

		let resizeWidth, resizeHeight;
		if (this.width && this.height) { // will not be known during an exact match scan
			if (this.width >= this.height) {
				resizeWidth = ImageFile.thumbnailMaxDim;
				resizeHeight = Math.floor(this.height * resizeWidth / this.width);
			} else {
				resizeHeight = ImageFile.thumbnailMaxDim;
				resizeWidth = Math.floor(this.width * resizeHeight / this.height);
			}

			canvas.width = resizeWidth * dpr;
			canvas.height = resizeHeight * dpr;
			canvas.style.width = resizeWidth + "px";
			canvas.style.height = resizeHeight + "px";
		}

		if (resizeWidth && resizeHeight) {
			// width & height were determined in getHash() (happens in perceptual match searches)

			// resizing inside createImageBitmap is slightly slower than in drawImage
			// but it makes much better thumbnails, even at "low" quality
			const bitmap = await createImageBitmap(blob, {
				resizeWidth: resizeWidth * dpr,
				resizeHeight: resizeHeight * dpr,
				resizeQuality: "low"
			});

			const ctx = canvas.getContext("2d");
			//ctx.drawImage(bitmap, 0, 0,  width * dpr, height * dpr);
			ctx.drawImage(bitmap, 0, 0);
			bitmap.close();
		} else {
			// width & height are not known because getHash() was not called (happens in exact match searches)

			const bitmap = await createImageBitmap(blob);
			this.width = bitmap.width;
			this.height = bitmap.height;

			if (bitmap.width >= bitmap.height) {
				resizeWidth = ImageFile.thumbnailMaxDim;
				resizeHeight = Math.floor(bitmap.height * resizeWidth / bitmap.width);
			} else {
				resizeHeight = ImageFile.thumbnailMaxDim;
				resizeWidth = Math.floor(bitmap.width * resizeHeight / bitmap.height);
			}

			canvas.width = resizeWidth * dpr;
			canvas.height = resizeHeight * dpr;
			canvas.style.width = resizeWidth + "px";
			canvas.style.height = resizeHeight + "px";

			const ctx = canvas.getContext("2d");
			ctx.drawImage(bitmap, 0, 0,  resizeWidth * dpr, resizeHeight * dpr);
			bitmap.close();
		}
	}
}

async function supportsJXL() {
	// A 1x1 JPEG XL image in Base64
	const jxlData = "data:image/jxl;base64,/wrkBggBCAgMAA==";

	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img.width > 0);
		img.onerror = () => resolve(false);
		img.src = jxlData;
	});
}

supportsJXL().then(supported => {
	if (supported) {
		ImageFile.formats.push("jxl");
	}
	console.log("jxl support: " + supported);
});
