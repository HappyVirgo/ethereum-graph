// Global Variables
var global = {
    balances: [],
    address: "",
    pointCount: 200
}

// Check for MetaMask, otherwise use an HTTP Provider
window.addEventListener('load', function () {
    if (typeof web3 !== 'undefined') {
        console.log('Web3 Detected! ' + web3.currentProvider.constructor.name)
        window.web3 = new Web3(web3.currentProvider);
    } else {
        console.log('No Web3 Detected... using HTTP Provider')
        window.web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/<APIKEY>"));
    }
})

// Wrapper for Web3 callback
const promisify = (inner) =>
    new Promise((resolve, reject) =>
        inner((err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        })
    );

// Get the first transaction block for an address
async function getFirstBlock(address) {
    try {
        let response = await fetch("https://api.etherscan.io/api?module=account&action=txlist&address=" + address + "&startblock=0&page=1&offset=10&sort=asc");
        let data = await response.json();

        if ((data.result).length > 0) {
            return data.result[0].blockNumber;
        } else {
            return -1;
        }
    } catch (error) {
        console.error(error);
    }
}

// Given an address and a range of blocks, query the Ethereum blockchain for the ETH balance across the range
async function getBalanceInRange(address, startBlock, endBlock) {
    var promises = []

    //Update UX with Start and End Block
    document.getElementById('startBlock').value = startBlock;
    document.getElementById('endBlock').value = endBlock;

    // Calculate the step size given the range of blocks and the number of points we want
    var step = Math.floor((endBlock - startBlock) / global.pointCount)
    // Make sure step is at least 1
    if (step < 1) {
        step = 1;
    }

    // Tell the user the data is loading...
    document.getElementById("output").innerHTML = "Loading";

    try {
        console.log(startBlock, endBlock)
        // Loop over the blocks, using the step value
        for (let i = startBlock; i < endBlock; i = i + step) {
            // If we already have data about that block, skip it
            if (!global.balances.find(x => x.block == i)) {
                // Create a promise to query the ETH balance for that block
                let promise = promisify(cb => web3.eth.getBalance(address, i, cb));
                // Queue the promise and include data about the block for output 
                promises.push(promise
                    .then(balance => (
                        {
                            block: i,
                            balance: parseFloat(web3.fromWei(balance, 'ether'))
                        })));
            }
        }

        // Call all promises in parellel for speed, result is array of {block: <block>, balance: <ETH balance>}
        var balances = await Promise.all(promises);

        //Remove loading message
        document.getElementById("output").innerHTML = "";

        return balances;

    } catch (error) {
        document.getElementById("output").innerHTML = error;
    }
}

// Unpack a multi-dimensional object
function unpack(rows, index) {
    return rows.map(function (row) {
        return row[index];
    });
}

// Create the plotly.js graph
function createGraph(balances) {
    // Create the trace we are going to plot
    var trace = {
        type: "scatter",
        mode: "lines",
        x: unpack(balances, 'block'),
        y: unpack(balances, 'balance'),
    }

    // Settings for the graph
    var layout = {
        title: 'ETH Balance over Ethereum Blocks',
        xaxis: {
            autorange: true,
            rangeslider: {},
            type: 'linear',
            title: 'Block'
        },
        yaxis: {
            autorange: true,
            type: 'linear',
            title: 'ETH Balance'
        },
    };

    Plotly.newPlot('graph', [trace], layout);

}

// Sort function for sort by block value
function sortBlock(a, b) {
    return a.block - b.block;
}

// When the graph is zoomed in, get more data points for that range
$('#graph').on('plotly_relayout', async function (eventdata) {
    // Get the new block range from the eventdata from the resize
    var startBlock = Math.floor(eventdata.target.layout.xaxis.range[0]);
    var endBlock = Math.ceil(eventdata.target.layout.xaxis.range[1]);

    // Get new balance data, and concatenate it to the existing data
    global.balances = global.balances.concat(await getBalanceInRange(global.address, startBlock, endBlock))

    // Sort the data by block number for Plotly.js, since it is a scatter plot
    global.balances.sort(sortBlock);

    // Create a new trace with new data
    var trace = {
        type: "scatter",
        mode: "lines",
        x: unpack(global.balances, 'block'),
        y: unpack(global.balances, 'balance'),
    }

    // Add new trace, then remove the old one... is there a better way to do this?
    Plotly.addTraces('graph', trace);
    Plotly.deleteTraces('graph', 0);
});

//Reset the page
function reset() {
    document.getElementById('output').innerHTML = "";
    Plotly.purge('graph');
    global.balances = [];
    global.address = "";
}

// Main function
async function graphBalance() {
    try {
        reset();

        // Get address from input
        global.address = document.getElementById("address").value;
        
        // Find the intial range, from first block to current block
        var startBlock, endBlock;

        if (document.getElementById('startBlock').value) {
            startBlock = parseInt(document.getElementById('startBlock').value);
        } else {
             startBlock = parseInt(await getFirstBlock(global.address));
        }

        if (document.getElementById('endBlock').value) {
            endBlock = parseInt(document.getElementById('endBlock').value);
        } else {
            endBlock = parseInt(web3.eth.blockNumber);
        }

        // Check that the address actually has transactions to show
        if (startBlock >= 0 && startBlock < endBlock) {
            // Get the balances from that range, store in global variable
            global.balances = await getBalanceInRange(global.address, startBlock, endBlock);

            // Create the graph
            createGraph(global.balances);
        } else {
            document.getElementById('output').innerHTML = "No transactions found for that address."
        }
    } catch (error) {
        document.getElementById("output").innerHTML = error;
    }
}

// Detect Querystrings
function parseQueryStrings() {
    var queryStrings = {};
    //Parse URL
    var url = window.location.search.substring(1);
    if (url) {
        //split querystrings
        var pairs = url.split("&");
        for (pair in pairs) {
            pairArray = pairs[pair].split("=");
            queryStrings[pairArray[0]] = pairArray[1]
        }
    }

    return queryStrings;
}

// On load, check if querystrings are present
window.onload = function () {
    // Check for querystrings
    var queryStrings = parseQueryStrings();
    // Set starting block
    if (queryStrings['start']) {
        document.getElementById('startBlock').value = queryStrings['start'];
    }
    // Set ending block
    if (queryStrings['end']) {
        document.getElementById('endBlock').value = queryStrings['end'];
    }
    // Set address, and run query
    if (queryStrings['address']) {
        document.getElementById('address').value = queryStrings['address'];
        graphBalance();
    }
}