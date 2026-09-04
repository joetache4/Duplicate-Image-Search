const pauseHandler = new Signal();

const State = {
    plugins: [persistence],

    state: {
        mustMatch     : null,
        fastRead      : false,
        exactMatch    : false,
        searchStatus  : "search_ready",
        clusters      : [],
        progressTotal : 0,
        progress      : 0,
        error         : 0,
    },

    getters: {
        isInitializing(state) {
            return state.searchStatus === "search_init";
        },
        isRunning(state) {
            return state.searchStatus === "search_running";
        },
        isPaused(state) {
            return state.searchStatus === "search_paused";
        },
        isEnded(state) {
            return state.searchStatus === "search_ended";
        },
    },

    mutations: {
        RESET(state) {
            state.clusters      = [];
            state.inputCount    = 0;
            state.progressTotal = 0;
            state.progress      = 0;
            state.error         = 0;
        },

        SET_SEARCH_STATE(state, payload) {
            state.searchStatus = payload;
            if (payload === "search_paused") {
                pauseHandler.pause();
            } else {
                pauseHandler.unpause();
            }
        },

        SET_MUST_MATCH_FILE(state, payload) {
            state.mustMatch = payload;
        },

        SET_FAST_READ_STATE(state, payload) {
            state.fastRead = payload;
        },

        SET_EXACT_STATE(state, payload) {
            state.exactMatch = payload;
        },

        SET_INPUT_COUNT(state, payload) {
            state.inputCount = payload;
        },

        SET_TOTAL(state, payload) {
            state.progressTotal = payload;
        },

        SET_PROGRESS(state, payload) {
            state.progress = payload;
        },

        INC_ERROR(state) {
            state.progress += 1;
        },

        CREATE_CLUSTER(state) {
            state.clusters.push({ ID: state.clusters.length, ifiles: [] });
        },

        ADD_TO_CLUSTER(state, payload) {
            state.clusters[payload.ID].ifiles.push(payload.ifile);
        },
    },

    actions: {
        async startSearch({ commit, state }, batchGenerator) {
            await executeSearch({ state, commit }, batchGenerator, pauseHandler);
        }
    }
};