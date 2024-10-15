const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { ethers } = require('ethers');
const fs = require('fs');

// Bot Configuratie
const DISCORD_TOKEN = 'YOUR_DISCORD_TOKEN';  // Vul je bot token in
const DISCORD_CHANNEL_ID = 'YOUR_CHANNEL_ID';  // Vul je Discord kanaal ID in
const SWAP_CHANNEL_ID = 'YOUR_SWAP_CHANNEL_ID'; // Vul je kanaal voor swaps in
const BUY_CHANNEL_ID = 'YOUR_BUY_CHANNEL_ID'; // Vul je kanaal voor aanbiedingen in
const CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS'; // Vul je contract adres in

// Provider en Contract Configuratie
const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID'); // Gebruik je Infura project ID
const ABI = [
  // Voeg hier je contract ABI toe (dit is een voorbeeld)
  "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 vtruAmount, uint256 usdcAmount)",
  "event SwapCompleted(uint256 indexed listingId, address indexed buyer, uint256 vtruAmount, uint256 usdcAmount)",
  "event OfferAccepted(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 vtruAmount, uint256 usdcAmount)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Laatste verwerkte blok
let lastBlock = 0;  // Dit kun je initialiseren met een opgeslagen waarde of 0
let totalUsdcAmount = ethers.BigNumber.from(0);
let totalVtruAmount = ethers.BigNumber.from(0);

// Bestand om de staat op te slaan
const stateFile = './state.json';

const loadState = () => {
  if (fs.existsSync(stateFile)) {
    const data = fs.readFileSync(stateFile);
    const state = JSON.parse(data);
    lastBlock = state.lastBlock;
  } else {
    lastBlock = 0;  // Stel in op 0 als er geen bestand is
  }
};

const saveState = () => {
  const state = { lastBlock };
  fs.writeFileSync(stateFile, JSON.stringify(state));
};

// Event Handlers
const shortenAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const pollEvents = async () => {
  try {
    console.log(`Polling events starting from block ${lastBlock + 1}...`);

    // Haal het laatste blocknummer op
    const currentBlock = await provider.getBlockNumber();

    // Loop door alle blocks van de laatste naar het huidige
    for (let blockNumber = lastBlock + 1; blockNumber <= currentBlock; blockNumber++) {
      console.log(`Processing block ${blockNumber}...`);

      // Haal logs op voor dit block
      const logs = await contract.queryFilter({ fromBlock: blockNumber, toBlock: blockNumber });

      for (const log of logs) {
        const { event, args } = log;
        const { listingId, seller, vtruAmount, usdcAmount, buyer } = args;

        // Handel ListingCreated Event af
        if (event === "ListingCreated") {
          console.log(`Listing Created | Listing ID: ${listingId}, Seller: ${shortenAddress(seller)}, VTRU: ${ethers.utils.formatUnits(vtruAmount, 18)}, USDC: ${ethers.utils.formatUnits(usdcAmount, 6)}`);

          // Stuur bericht naar Discord voor nieuwe listing
          const listingEmbed = new EmbedBuilder()
            .setTitle('New Listing Created')
            .setDescription(`A new listing was created by ${shortenAddress(seller)}`)
            .addFields(
              { name: 'Listing ID', value: listingId.toString() },
              { name: 'VTRU Amount', value: `${ethers.utils.formatUnits(vtruAmount, 18)} VTRU` },
              { name: 'USDC Amount', value: `${ethers.utils.formatUnits(usdcAmount, 6)} USDC` }
            )
            .setColor('GREEN');
          client.channels.cache.get(DISCORD_CHANNEL_ID).send({ embeds: [listingEmbed] });
        }

        // Handel SwapCompleted Event af
        else if (event === "SwapCompleted") {
          console.log(`Swap Completed | Listing ID: ${listingId}, Buyer: ${shortenAddress(buyer)}, VTRU: ${ethers.utils.formatUnits(vtruAmount, 18)}, USDC: ${ethers.utils.formatUnits(usdcAmount, 6)}`);

          // Stuur bericht naar Discord voor swap
          const swapEmbed = new EmbedBuilder()
            .setTitle('Swap Completed')
            .setDescription(`A swap was completed by ${shortenAddress(buyer)}`)
            .addFields(
              { name: 'Listing ID', value: listingId.toString() },
              { name: 'VTRU Amount', value: `${ethers.utils.formatUnits(vtruAmount, 18)} VTRU` },
              { name: 'USDC Amount', value: `${ethers.utils.formatUnits(usdcAmount, 6)} USDC` }
            )
            .setColor('BLUE');
          client.channels.cache.get(SWAP_CHANNEL_ID).send({ embeds: [swapEmbed] });

          // Update de totaalbedragen
          totalUsdcAmount = totalUsdcAmount.add(usdcAmount);
          totalVtruAmount = totalVtruAmount.add(vtruAmount);
        }

        // Handel OfferAccepted Event af
        else if (event === "OfferAccepted") {
          console.log(`Offer Accepted | Listing ID: ${listingId}, Seller: ${shortenAddress(seller)}, Buyer: ${shortenAddress(buyer)}, VTRU: ${ethers.utils.formatUnits(vtruAmount, 18)}, USDC: ${ethers.utils.formatUnits(usdcAmount, 6)}`);

          // Stuur bericht naar Discord voor aanbod
          const offerAcceptedEmbed = new EmbedBuilder()
            .setTitle('Offer Accepted')
            .setDescription(`An offer was accepted by ${shortenAddress(buyer)} for listing ${listingId}`)
            .addFields(
              { name: 'Listing ID', value: listingId.toString() },
              { name: 'VTRU Amount', value: `${ethers.utils.formatUnits(vtruAmount, 18)} VTRU` },
              { name: 'USDC Amount', value: `${ethers.utils.formatUnits(usdcAmount, 6)} USDC` }
            )
            .setColor('RED');
          client.channels.cache.get(BUY_CHANNEL_ID).send({ embeds: [offerAcceptedEmbed] });
        }
      }
    }

    // Update de laatste verwerkte block
    lastBlock = currentBlock;
    saveState();  // Sla de huidige block op als de laatste verwerkte block

  } catch (error) {
    console.error('Error occurred while polling events:', error);
  }
};

// Start de polling om de 30 seconden
setInterval(pollEvents, 30000);

// Wanneer de bot inlogt
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadState();  // Laad de laatst verwerkte staat
  pollEvents(); // Start de eerste keer pollen
});

// Login naar Discord
client.login(DISCORD_TOKEN);
