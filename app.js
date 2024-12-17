const API_ENDPOINT = "https://api-v2.flipsidecrypto.xyz/json-rpc";
const API_KEY = "YOUR_Flipside_API_KEY"; // Replace with your actual API key

// Function to create a query
async function createQuery(walletAddress) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };

  const thorchainQuery = `
       WITH pools_count AS (
    SELECT
        swaps.tx_id,
        COUNT(DISTINCT swaps.pool_name) AS n_pools
    FROM thorchain.defi.fact_swaps AS swaps
    LEFT JOIN thorchain.defi.fact_refund_events AS refunds
    ON swaps.tx_id = refunds.tx_id
    WHERE refunds.tx_id IS NULL
    AND swaps.from_address = '${walletAddress}'
    GROUP BY swaps.tx_id
)
SELECT
    ROUND(SUM(from_amount_usd)) AS swap_volume,
    ROUND(COUNT(DISTINCT a.tx_id)) AS n_swaps,
    ROUND(SUM((from_amount_usd / n_pools) * AFFILIATE_FEE_BASIS_POINTS) / 10000) AS affiliate_fee_paid
FROM thorchain.defi.fact_swaps AS a
JOIN pools_count USING(tx_id)
WHERE a.from_address = '${walletAddress}'
AND a.affiliate_address IS NOT NULL;

    `;

  const payload = {
    jsonrpc: "2.0",
    method: "createQueryRun",
    params: [
      {
        resultTTLHours: 1,
        maxAgeMinutes: 0,
        sql: thorchainQuery,
        tags: {
          source: "thorchain-analytics",
          env: "production",
        },
        dataSource: "snowflake-default",
        dataProvider: "flipside",
      },
    ],
    id: 1,
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Error creating query:", error);
    throw error;
  }
}

// Function to check query status
async function checkQueryStatus(queryRunId) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };

  const payload = {
    jsonrpc: "2.0",
    method: "getQueryRun",
    params: [{ queryRunId }],
    id: 1,
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Error checking query status:", error);
    throw error;
  }
}

// Function to get query results
async function getQueryResults(queryRunId) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };

  const payload = {
    jsonrpc: "2.0",
    method: "getQueryRunResults",
    params: [
      {
        queryRunId,
        format: "json",
        page: { number: 1, size: 1000 },
      },
    ],
    id: 1,
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Error getting query results:", error);
    throw error;
  }
}

// Function to display results in the table
function displayResults(results) {
  const resultTable = document.getElementById("result-table");
  if (!results || !results.result || !results.result.rows || results.result.rows.length === 0) {
    resultTable.innerHTML = "<p>No data found for this wallet address.</p>";
    return;
  }

  const data = results.result.rows[0];
  const html = `
        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
            </tr>
            <tr>
                <td>Swap Volume (USD)</td>
                <td>$${data.swap_volume || 0}</td>
            </tr>
            <tr>
                <td>Number of Swaps</td>
                <td>${data.n_swaps || 0}</td>
            </tr>
            <tr>
                <td>Affiliate Fee Paid (USD)</td>
                <td>$${data.affiliate_fee_paid || 0}</td>
            </tr>
        </table>
    `;
  resultTable.innerHTML = html;
}

// Main function to run the query process
async function runFullQuery(walletAddress) {
  try {
    const createResponse = await createQuery(walletAddress);
    const queryRunId = createResponse.result.queryRun.id;

    let queryStatus;
    do {
      const statusResponse = await checkQueryStatus(queryRunId);
      queryStatus = statusResponse.result.queryRun.state;
      if (queryStatus !== "QUERY_STATE_SUCCESS") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (queryStatus !== "QUERY_STATE_SUCCESS");

    const results = await getQueryResults(queryRunId);
    displayResults(results);
  } catch (error) {
    console.error("Error in query process:", error);
    document.getElementById("result-table").innerHTML =
      '<p class="error">Error fetching data. Please try again.</p>';
  }
}

// Event listener for the fetch button
document.getElementById("fetch-data").addEventListener("click", () => {
  const walletAddress = document.getElementById("wallet-address").value;
  if (!walletAddress) {
    alert("Please enter a wallet address");
    return;
  }
  document.getElementById("result-table").innerHTML = "<p>Loading...</p>";
  runFullQuery(walletAddress).catch(console.error);
});
