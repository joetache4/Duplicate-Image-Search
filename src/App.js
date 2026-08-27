const App = {

	template: `
<SetupPage   ref="setupPage"   v-show="page === 'setup'"></SetupPage>
<ResultsPage ref="resultsPage" v-show="page !== 'setup'"></ResultsPage>
`,

	data() {
		return {
			page : "setup",
		}
	},

	mounted() {
		this.$refs.setupPage.$el.focus();
	},

	computed: {
		searchStatus() {
			return this.$store.state.searchStatus;
		}
	},

	watch: {
		searchStatus(oldVal, newVal) {
			if (newVal === "search_ready") {
				this.page = "setup";
				this.$refs.setupPage.$el.focus();
			} else {
				this.page = "results";
				this.$refs.resultsPage.$el.focus();
			}
		}
	}
}
