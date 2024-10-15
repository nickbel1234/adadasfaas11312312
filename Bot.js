// Import required modules
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

// Initialize Discord Client with necessary intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Gebruik Render's dynamische poort (uit omgevingsvariabelen)
const PORT = process.env.PORT || 3000;

// Web server als je die wilt draaien (optioneel, render vereist soms een web server)
app.listen(PORT, () => {
  console.log(`Web server luistert op poort ${PORT}`);
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

    console.log(`Found ${listingEvents.length} new ListingCreated event(s), ${swapEvents.length} new SwapCompleted event(s), and ${offerAcceptedEvents.length} new OfferAccepted event(s).`);

    // Process all events
    const allEvents = [...listingEvents, ...swapEvents, ...offerAcceptedEvents];

    for (const event of allEvents) {
      const { usdcAmount, vtruAmount } = event.args;

      // Update total amounts
      totalUsdcAmount = totalUsdcAmount.add(usdcAmount);
      totalVtruAmount = totalVtruAmount.add(vtruAmount);

      // Save state after processing each event
      saveState();

      // Update bot status
      updateBotStatus();

      // Handle individual events
      if (event.event === 'ListingCreated') {
        await handleListingCreated(event);
      } else if (event.event === 'SwapCompleted') {
        await handleSwapCompleted(event);
      } else if (event.event === 'OfferAccepted') {
        await handleOfferAccepted(event);
      }
    }

    // Update lastBlock to the current block
    lastBlock = currentBlock;
    saveState();

  } catch (error) {
    console.error('Error polling for events:', error);
  }
}

// Function to handle ListingCreated event
async function handleListingCreated(event) {
  const { listingId, seller, vtruAmount, usdcAmount } = event.args;
  const transactionHash = event.transactionHash;

  // Format amounts
  const formattedVtru = parseFloat(ethers.utils.formatUnits(vtruAmount, 18));
  const formattedUsdc = parseFloat(ethers.utils.formatUnits(usdcAmount, 6));

  // Compute ratios
  const usdcPerVtru = formattedUsdc / formattedVtru;
  const vtruPerUsdc = formattedVtru / formattedUsdc;

  // Format ratios
  const formattedUsdcPerVtru = usdcPerVtru.toFixed(6);
  const formattedVtruPerUsdc = vtruPerUsdc.toFixed(6);

  // Construct the listing URL (direct link without listingId)
  const listingURL = `https://otcmarket.vercel.app/`;

  // Construct the explorer link
  const explorerLink = `${EXPLORER_BASE_URL}/${transactionHash}`;

  // Create an Embed Message for ListingCreated
  const embed = new EmbedBuilder()
    .setTitle('🚀 **New Listing Created!** 🚀')
    .setColor('#00FF00')
    .addFields(
      { name: '🆔 Listing ID', value: `\`${listingId.toString()}\``, inline: true },
      { name: '👤 Seller', value: `\`${shortenAddress(seller)}\``, inline: true },
      { name: '💰 VTRU Amount', value: `\`${formattedVtru} VTRU\``, inline: true },
      { name: '💵 USDC Amount', value: `\`${formattedUsdc} USDC\``, inline: true },
      { name: '💱 USDC per VTRU', value: `\`${formattedUsdcPerVtru} USDC/VTRU\``, inline: true },
      { name: '🔄 VTRU per USDC', value: `\`${formattedVtruPerUsdc} VTRU/USDC\``, inline: true },
      { name: '🔗 View More', value: `[Visit the OTC Website](${listingURL})`, inline: false },
      { name: '🔗 Explorer Link', value: `[View Transaction](${explorerLink})`, inline: false }
    )
    .setThumbnail('https://swap.vitruveo.xyz/images/coins/wVTRU.png')
    .setTimestamp()
    .setFooter({ text: 'VTRU Listings', iconURL: 'https://swap.vitruveo.xyz/images/coins/wVTRU.png' });

  // Send the listing event to the listings channel with @here mention
  const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
  if (channel) {
    channel.send({
      content: '@here A new listing has been created!',
      embeds: [embed],
      allowed_mentions: { parse: ['everyone'] },
    })
    .then(() => console.log(`Posted Listing ID: ${listingId.toString()}`))
    .catch(err => console.error('Error sending message to Discord:', err));
  } else {
    console.error("Discord channel not found for listings! Please check the channel ID.");
  }
}

// Function to handle SwapCompleted event
async function handleSwapCompleted(event) {
  const { listingId, buyer, vtruAmount, usdcAmount } = event.args;
  const transactionHash = event.transactionHash;

  // Format amounts
  const formattedVtru = parseFloat(ethers.utils.formatUnits(vtruAmount, 18));
  const formattedUsdc = parseFloat(ethers.utils.formatUnits(usdcAmount, 6));

  // Compute ratios
  const usdcPerVtru = formattedUsdc / formattedVtru;
  const vtruPerUsdc = formattedVtru / formattedUsdc;

  // Format ratios
  const formattedUsdcPerVtru = usdcPerVtru.toFixed(6);
  const formattedVtruPerUsdc = vtruPerUsdc.toFixed(6);

  // Create an Embed Message for SwapCompleted
  const embed = new EmbedBuilder()
    .setTitle('🔄 **Swap Completed!** 🔄')
    .setColor('#FF0000')
    .addFields(
      { name: '🆔 Listing ID', value: `\`${listingId.toString()}\``, inline: true },
      { name: '👤 Buyer', value: `\`${shortenAddress(buyer)}\``, inline: true },
      { name: '💰 VTRU Amount Swapped', value: `\`${formattedVtru} VTRU\``, inline: true },
      { name: '💵 USDC Amount Swapped', value: `\`${formattedUsdc} USDC\``, inline: true },
      { name: '💱 USDC per VTRU', value: `\`${formattedUsdcPerVtru} USDC/VTRU\``, inline: true },
      { name: '🔄 VTRU per USDC', value: `\`${formattedVtruPerUsdc} VTRU/USDC\``, inline: true },
      { name: '🔗 Explorer Link', value: `[View Transaction](${EXPLORER_BASE_URL}/${transactionHash})`, inline: false }
    )
    .setThumbnail('https://swap.vitruveo.xyz/images/coins/wVTRU.png')
    .setTimestamp()
    .setFooter({ text: 'VTRU Swaps', iconURL: 'https://swap.vitruveo.xyz/images/coins/wVTRU.png' });

  // Send the swap event to the swaps channel with @here mention
  const swapChannel = client.channels.cache.get(SWAP_CHANNEL_ID);
  if (swapChannel) {
    swapChannel.send({
      content: '@here A swap has been completed!',
      embeds: [embed],
      allowed_mentions: { parse: ['everyone'] },
    })
    .then(() => console.log(`Posted Swap Completed for Listing ID: ${listingId.toString()}`))
    .catch(err => console.error('Error sending swap message to Discord:', err));
  } else {
    console.error("Discord channel not found for swaps! Please check the channel ID.");
  }
}

// Function to handle OfferAccepted event
async function handleOfferAccepted(event) {
  const { listingId, seller, buyer, vtruAmount, usdcAmount } = event.args;
  const transactionHash = event.transactionHash;

  // Format amounts
  const formattedVtru = parseFloat(ethers.utils.formatUnits(vtruAmount, 18));
  const formattedUsdc = parseFloat(ethers.utils.formatUnits(usdcAmount, 6));

  // Compute ratios
  const usdcPerVtru = formattedUsdc / formattedVtru;
  const vtruPerUsdc = formattedVtru / formattedUsdc;

  // Format ratios
  const formattedUsdcPerVtru = usdcPerVtru.toFixed(6);
  const formattedVtruPerUsdc = vtruPerUsdc.toFixed(6);

  // Create an Embed Message for OfferAccepted
  const embed = new EmbedBuilder()
    .setTitle('💸 **Offer Accepted!** 💸')
    .setColor('#FFA500')
    .addFields(
      { name: '🆔 Listing ID', value: `\`${listingId.toString()}\``, inline: true },
      { name: '👤 Seller', value: `\`${shortenAddress(seller)}\``, inline: true },
      { name: '👤 Buyer', value: `\`${shortenAddress(buyer)}\``, inline: true },
      { name: '💰 VTRU Amount Bought', value: `\`${formattedVtru} VTRU\``, inline: true },
      { name: '💵 USDC Amount Paid', value: `\`${formattedUsdc} USDC\``, inline: true },
      { name: '💱 USDC per VTRU', value: `\`${formattedUsdcPerVtru} USDC/VTRU\``, inline: true },
      { name: '🔄 VTRU per USDC', value: `\`${formattedVtruPerUsdc} VTRU/USDC\``, inline: true },
      { name: '🔗 Explorer Link', value: `[View Transaction](${EXPLORER_BASE_URL}/${transactionHash})`, inline: false }
    )
    .setThumbnail('https://swap.vitruveo.xyz/images/coins/wVTRU.png')
    .setTimestamp()
    .setFooter({ text: 'VTRU Purchases', iconURL: 'https://swap.vitruveo.xyz/images/coins/wVTRU.png' });

  // Send the buy event to the buy channel with @here mention
  const buyChannel = client.channels.cache.get(BUY_CHANNEL_ID);
  if (buyChannel) {
    buyChannel.send({
      content: '@here An offer has been accepted!',
      embeds: [embed],
      allowed_mentions: { parse: ['everyone'] },
    })
    .then(() => console.log(`Posted OfferAccepted (Buy) for Listing ID: ${listingId.toString()}`))
    .catch(err => console.error('Error sending buy message to Discord:', err));
  } else {
    console.error("Discord channel not found for buy events! Please check the channel ID.");
  }
}

// Handle Discord Errors
client.on('error', (error) => {
  console.error('Discord Client Error:', error);
});

// Login to Discord
client.login(DISCORD_TOKEN);
