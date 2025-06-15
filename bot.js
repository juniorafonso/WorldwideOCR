const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const db = require('./utils/database'); // Importa a configuração simplificada do banco de dados

dotenv.config();

const TOKEN = process.env.TOKEN;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});
client.commands = new Collection();
client.db = db; // Torna os modelos do banco de dados acessíveis através do client

// Carregar Comandos
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[CMDS] Comando ${command.data.name} carregado.`);
        } else {
            console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
        }
    }
} else {
    console.log("[AVISO] Pasta 'commands' não encontrada. Nenhum comando carregado.");
}


// Carregar Eventos
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`[EVTS] Evento ${event.name} carregado.`);
    }
} else {
    console.log("[AVISO] Pasta 'events' não encontrada. Nenhum evento carregado.");
}


// Sincronizar o banco de dados e iniciar o bot
async function startBot() {
    try {
        await db.sequelize.authenticate();
        console.log('[DB] Conexão com o banco de dados estabelecida com sucesso.');
        await db.sequelize.sync(); // Ou apenas db.sequelize.sync()
        console.log('[DB] Todos os modelos foram sincronizados com sucesso.');

        await client.login(TOKEN);
    } catch (error) {
        console.error('[DB] Não foi possível conectar ou sincronizar o banco de dados:', error);
        process.exit(1); // Sai se não conseguir conectar/sincronizar o DB
    }
}

startBot();