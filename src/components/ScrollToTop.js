const ScrollToTop = {
	props: ["scrollableID"],
	template: `
<div
	class="scroll-button"
	ref="scrollButton"
	@click="scrollToTop"
>Back to Top</div>
`,
	mounted() {
		// toggle visibility based on scroll position
		const scrollButton = this.$refs.scrollButton;
		const scrollable = document.getElementById(this.scrollableID);
		scrollable.addEventListener("scroll", () => {
			if (scrollable.scrollTop > 200) {
				scrollButton.style.visibility = "visible";
				scrollButton.style.opacity = 1;
			} else {
				scrollButton.style.opacity = 0;
				setTimeout(() => {
					if (scrollButton.style.opacity === "0") {
						scrollButton.style.visibility = "hidden";
					}
				}, 200);
			}
		});
	},
	methods: {
		scrollToTop() {
			const scrollable = document.getElementById(this.scrollableID);
			scrollable.scrollTo({top: 0, behavior: "smooth"});
		},
	},
}
