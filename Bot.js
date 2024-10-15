// Import required modules
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { ethers } = require('ethers');
const fs = require('fs');
const express = require('express'); // Add Express for Render compatibility
require('dotenv').config();

// Initialize Discord Client with necessary intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});


// Render expects a web server to bind to a port (use the port from environment variable)
const PORT = process.env.PORT || 3000; // Fallback to port 3000 if PORT is not set


// Listen to the specified port (for Render)
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Load environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VITRUVEO_RPC = process.env.VITRUVEO_RPC;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;  // Channel for listing events
const SWAP_CHANNEL_ID = process.env.SWAP_CHANNEL_ID;        // Channel for swap events
const BUY_CHANNEL_ID = process.env.BUY_CHANNEL_ID;          // Channel for buy events
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000; // Default to 30 seconds
const LAST_BLOCK_FILE = 'lastBlock.json';
const AVERAGES_FILE = 'averages.json';
const EXPLORER_BASE_URL = 'https://explorer.vitruveo.xyz/tx';

// ABI of the contract with relevant events (ListingCreated, SwapCompleted, and OfferAccepted)
const abi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "listingId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "vtruAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "usdcAmount",
        "type": "uint256"
      }
    ],
    "name": "ListingCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "listingId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "usdcAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "vtruAmount",
        "type": "uint256"
      }
    ],
    "name": "SwapCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "listingId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "usdcAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "vtruAmount",
        "type": "uint256"
      }
    ],
    "name": "OfferAccepted",
    "type": "event"
  }
];

// Initialize ethers.js Provider
const provider = new ethers.providers.JsonRpcProvider(VITRUVEO_RPC);

// Create Contract Instance
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

// Track Last Processed Block
let lastBlock = 0;

// Variables to track totals (using BigNumber)
let totalUsdcAmount = ethers.BigNumber.from(0);
let totalVtruAmount = ethers.BigNumber.from(0);

// Function to Load lastBlock and totals from file
const loadState = () => {
  if (fs.existsSync(LAST_BLOCK_FILE)) {
    try {
      const data = fs.readFileSync(LAST_BLOCK_FILE, 'utf8');
      const json = JSON.parse(data);
      lastBlock = json.lastBlock || 0;
      console.log(`Loaded lastBlock from file: ${lastBlock}`);
    } catch (error) {
      console.error('Error reading lastBlock file:', error);
      process.exit(1);
    }
  }

  if (fs.existsSync(AVERAGES_FILE)) {
    try {
      const data = fs.readFileSync(AVERAGES_FILE, 'utf8');
      const json = JSON.parse(data);
      totalUsdcAmount = ethers.BigNumber.from(json.totalUsdcAmount || "0");
      totalVtruAmount = ethers.BigNumber.from(json.totalVtruAmount || "0");
      console.log(`Loaded totals from file: ${JSON.stringify(json)}`);
    } catch (error) {
      console.error('Error reading averages file:', error);
      console.error('Resetting totals to zero.');
      totalUsdcAmount = ethers.BigNumber.from(0);
      totalVtruAmount = ethers.BigNumber.from(0);
    }
  }
};

// Function to Save lastBlock and totals to file
const saveState = () => {
  try {
    fs.writeFileSync(LAST_BLOCK_FILE, JSON.stringify({ lastBlock }));
    fs.writeFileSync(AVERAGES_FILE, JSON.stringify({
      totalUsdcAmount: totalUsdcAmount.toString(),
      totalVtruAmount: totalVtruAmount.toString()
    }));
    console.log(`Saved lastBlock and totals.`);
  } catch (error) {
    console.error('Error writing state files:', error);
  }
};

// Function to Shorten Ethereum Addresses (Optional)
const shortenAddress = (address) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Function to Update Bot's Status
const updateBotStatus = () => {
  const totalUsdc = parseFloat(ethers.utils.formatUnits(totalUsdcAmount, 6));
  const totalVtru = parseFloat(ethers.utils.formatUnits(totalVtruAmount, 18));

  if (totalVtru > 0) {
    const avgUsdcPerVtru = totalUsdc / totalVtru;
    client.user.setActivity(`Avg: 1 VTRU = ${avgUsdcPerVtru.toFixed(6)} USDC`, { type: ActivityType.Watching });
    console.log('Updated bot status with average swap ratios.');
  } else {
    client.user.setActivity(`Monitoring VTRU/USDC swaps`, { type: ActivityType.Watching });
    console.log('Set default bot status.');
  }
};

// Discord Bot Ready Event
client.once('ready', async () => {
  console.log('Bot is online and starting to poll for events!');

  // Load lastBlock and totals from file if exists
  loadState();

  try {
    if (lastBlock === 0) {
      // Initialize lastBlock to current block minus some buffer (e.g., 100 blocks)
      const currentBlock = await provider.getBlockNumber();
      lastBlock = currentBlock - 100; // Adjust the buffer as needed
      console.log(`Starting polling from block number: ${lastBlock}`);
      // Save the initial lastBlock
      saveState();
    }
  } catch (error) {
    console.error('Error initializing lastBlock:', error);
    process.exit(1);
  }

  // Start polling at defined intervals
  setInterval(pollEvents, POLL_INTERVAL);
  // Update bot status every minute
  setInterval(updateBotStatus, 60000);
});

// Function to Poll for Events
async function pollEvents() {
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Polling from block ${lastBlock + 1} to ${currentBlock}`);

    // Fetch past events
    const listingEvents = await contract.queryFilter('ListingCreated', lastBlock + 1, currentBlock);
    const swapEvents = await contract.queryFilter('SwapCompleted', lastBlock + 1, currentBlock);
    const offerAcceptedEvents = await contract.queryFilter('OfferAccepted', lastBlock + 1, currentBlock);

    for (const event of listingEvents) {
      // Handle ListingCreated Event
      console.log('ListingCreated Event:', event.args);
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('New Listing Created')
        .addFields(
          { name: 'Seller', value: shortenAddress(event.args.seller), inline: true },
          { name: 'VTRU Amount', value: ethers.utils.formatUnits(event.args.vtruAmount, 18), inline: true },
          { name: 'USDC Amount', value: ethers.utils.formatUnits(event.args.usdcAmount, 6), inline: true }
        )
        .setFooter({ text: 'Listing Created' });
      client.channels.cache.get(DISCORD_CHANNEL_ID).send({ embeds: [embed] });
    }

    for (const event of swapEvents) {
      // Handle SwapCompleted Event
      console.log('SwapCompleted Event:', event.args);
      totalUsdcAmount = totalUsdcAmount.add(event.args.usdcAmount);
      totalVtruAmount = totalVtruAmount.add(event.args.vtruAmount);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Swap Completed')
        .addFields(
          { name: 'Buyer', value: shortenAddress(event.args.buyer), inline: true },
          { name: 'VTRU Amount', value: ethers.utils.formatUnits(event.args.vtruAmount, 18), inline: true },
          { name: 'USDC Amount', value: ethers.utils.formatUnits(event.args.usdcAmount, 6), inline: true }
        )
        .setFooter({ text: 'Swap Completed' });
      client.channels.cache.get(SWAP_CHANNEL_ID).send({ embeds: [embed] });
    }

    for (const event of offerAcceptedEvents) {
      // Handle OfferAccepted Event
      console.log('OfferAccepted Event:', event.args);
      const embed = new EmbedBuilder()
        .setColor(0xFFFF00)
        .setTitle('Offer Accepted')
        .addFields(
          { name: 'Buyer', value: shortenAddress(event.args.buyer), inline: true },
          { name: 'VTRU Amount', value: ethers.utils.formatUnits(event.args.vtruAmount, 18), inline: true },
          { name: 'USDC Amount', value: ethers.utils.formatUnits(event.args.usdcAmount, 6), inline: true }
        )
        .setFooter({ text: 'Offer Accepted' });
      client.channels.cache.get(BUY_CHANNEL_ID).send({ embeds: [embed] });
    }

    // Update lastBlock for the next poll
    lastBlock = currentBlock;
    saveState();
  } catch (error) {
    console.error('Error polling events:', error);
  }
}

// Login to Discord
client.login(DISCORD_TOKEN);
