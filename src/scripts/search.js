async function executeSearch(store, batchGenerator, pauseHandler) {
    console.time("searchTimer");
    store.commit("RESET");
    store.commit("SET_SEARCH_STATE", "search_init");

    const validFiles = [];
    let inputCount = 0;
    let lastTime = 0;
    let doCommit = false;

    for await (const batch of batchGenerator) {
        inputCount += batch.length;

        const now = performance.now();
        if (now - lastTime > 16) {
            lastTime = now;
            doCommit = true;
        } else {
            doCommit = false;
        }
        if (doCommit) {
            store.commit("SET_INPUT_COUNT", inputCount);
        }

        batch.forEach(file => {
            const ifile = new ImageFile(file);
            if (ifile.isValid()) {
                validFiles.push(ifile);
            }
        });
    }

    store.commit("SET_INPUT_COUNT", inputCount);
    store.commit("SET_SEARCH_STATE", "search_running");

    const state = store.state;
    let candidates = [];

    if (state.exactMatch && state.mustMatch !== null) {
        Array.from(validFiles).forEach(ifile => {
            if (ifile.file.size == state.mustMatch.size) {
                candidates.push(ifile);
            }
        });
    } else if (state.exactMatch) {
        const counts = {};
        Array.from(validFiles).forEach(ifile => {
            const val = ifile.file.size;
            counts[val] = (counts[val] || 0) + 1;
        });
        const uniqueSizes = new Set(Object.keys(counts).filter(key => counts[key] === 1));
        Array.from(validFiles).forEach(ifile => {
            if (!uniqueSizes.has(ifile.file.size)) {
                candidates.push(ifile);
            }
        });
    } else {
        candidates = validFiles;
    }

    store.commit("SET_TOTAL", candidates.length);

    const mustMatch = state.mustMatch ? new ImageFile(state.mustMatch) : null;
    if (mustMatch) {
        mustMatch.clusterID = 0;
        await mustMatch.load(state.fastRead, state.exactMatch);
    }

    const scannedFiles = [];
    lastTime = 0;
    doCommit = false;

    for (let i = 0; i < candidates.length; i++) {
        const now = performance.now();
        if (now - lastTime > 16) {
            lastTime = now;
            doCommit = true;
        } else {
            doCommit = false;
        }

        let ifile = candidates[i];

        if (mustMatch) {
            scannedFiles.push(mustMatch);
        }

        try {
            await ifile.load(state.fastRead, state.exactMatch);
            await pauseHandler.waitIfPaused();

            for (const ifile2 of scannedFiles) {
                if (ifile.isSimilar(ifile2, state.exactMatch)) {
                    const idx1 = ifile.clusterID;
                    const idx2 = ifile2.clusterID;

                    if (mustMatch && state.clusters.length == 0) {
                        store.commit("CREATE_CLUSTER");
                        store.commit("ADD_TO_CLUSTER", { ID: 0, ifile: ifile });
                        ifile.clusterID = 0;
                    } else if (idx1 === null && idx2 === null) {
                        ifile.clusterID = state.clusters.length;
                        ifile2.clusterID = state.clusters.length;
                        store.commit("CREATE_CLUSTER");
                        store.commit("ADD_TO_CLUSTER", { ID: state.clusters.length - 1, ifile: ifile2 });
                        store.commit("ADD_TO_CLUSTER", { ID: state.clusters.length - 1, ifile: ifile });
                    } else {
                        store.commit("ADD_TO_CLUSTER", { ID: idx2, ifile: ifile });
                        ifile.clusterID = idx2;
                    }
                    break;
                }
            }
            if (!mustMatch) {
                scannedFiles.push(ifile);
            }
        } catch (err) {
            console.log("ERROR loading: " + ifile.relpath);
            console.log(err);
            store.commit("INC_ERROR");
        } finally {
            if (doCommit) {
                store.commit("SET_PROGRESS", i);
            }
        }
    }

    store.commit("SET_PROGRESS", candidates.length);
    store.commit("SET_SEARCH_STATE", "search_ended");
    console.timeEnd("searchTimer");
}
