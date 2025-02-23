// Load environment variables
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// ✅ CORS Headers Middleware (For Cross-Origin Requests)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// Create a connection to the database using .env variables
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to the database.');
});

// Get total 40% payout for a specific walletaddress
app.post('/getPayableAmount', async (req, res) => {
  const { walletAddress } = req.body; // Get wallet address from request body

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    // Get all txhash for walletaddress with paymentstatus = 'canpay'
    const query = `
      SELECT txhash 
      FROM afilliateprogram 
      WHERE paymentstatus = 'canpay' 
      AND walletaddress = ?
    `;

    db.query(query, [walletAddress], async (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: 'Database query failed' });
      }

      let totalEth = 0;
      for (const row of results) {
        const { txhash } = row;

        // Get transaction details from Infura
        const infuraUrl = `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
        const data = {
          jsonrpc: "2.0",
          method: "eth_getTransactionByHash",
          params: [txhash],
          id: 1
        };

        try {
          const response = await axios.post(infuraUrl, data, {
            headers: {
              'Content-Type': 'application/json'
            }
          });

          const tx = response.data.result;
          if (tx && tx.value) {
            // Convert Wei to ETH
            const ethValue = parseInt(tx.value, 16) / (10 ** 18);
            totalEth += ethValue;
          }
        } catch (error) {
          console.error(`Error fetching transaction ${txhash}:`, error.message);
        }
      }

      // Calculate 40% of the total ETH value
      const payout = totalEth * 0.4;

      console.log(`Total ETH: ${totalEth}, Payout (40%): ${payout}`);
      res.json({ 
        walletAddress,
        totalPayout: payout 
      });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
