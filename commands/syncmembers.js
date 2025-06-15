const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { Op } = require('sequelize'); // Importar Op para operadores do Sequelize

const MEMBERS_URL = process.env.MEMBERS_URL;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syncmembers')
        .setDescription('Sincroniza a lista de membros da guilda da API com o banco de dados.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Apenas administradores podem usar
    async execute(interaction) {
        if (!MEMBERS_URL) {
            return interaction.reply({ content: 'A URL da API de membros não está configurada no servidor.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false }); // Resposta inicial para evitar timeout

        const { GuildMember } = interaction.client.db;

        try {
            console.log('[API] Buscando membros da guilda de:', MEMBERS_URL);
            const response = await axios.get(MEMBERS_URL);
            const apiMembers = response.data;

            if (!Array.isArray(apiMembers)) {
                console.error('[API] Resposta da API de membros não é um array:', apiMembers);
                return interaction.editReply({ content: 'Erro ao buscar dados da API: formato inesperado.' });
            }

            console.log(`[API] ${apiMembers.length} membros encontrados na API.`);

            const apiMemberIds = apiMembers.map(member => member.Id);
            let membersAdded = 0;
            let membersUpdated = 0;
            let membersRemoved = 0;

            // 1. Adicionar ou Atualizar membros
            for (const apiMember of apiMembers) {
                if (!apiMember.Id || !apiMember.Name) {
                    console.warn('[API] Membro da API com Id ou Name faltando:', apiMember);
                    continue;
                }

                const [dbMember, created] = await GuildMember.findOrCreate({
                    where: { Id: apiMember.Id },
                    defaults: { Name: apiMember.Name },
                });

                if (created) {
                    membersAdded++;
                } else {
                    // Se não foi criado, verificar se precisa atualizar
                    if (dbMember.Name !== apiMember.Name) {
                        dbMember.Name = apiMember.Name;
                        // Atualize outros campos aqui se necessário
                        await dbMember.save();
                        membersUpdated++;
                    }
                }
            }

            // 2. Remover membros que não estão mais na API
            const membersToRemove = await GuildMember.findAll({
                where: {
                    Id: { [Op.notIn]: apiMemberIds }, // Encontra membros no DB cujo Id NÃO está na lista da API
                },
            });

            for (const memberToRemove of membersToRemove) {
                await memberToRemove.destroy();
                membersRemoved++;
            }

            const replyMessage = `Sincronização concluída!\n` +
                                 `- Membros adicionados: ${membersAdded}\n` +
                                 `- Membros atualizados: ${membersUpdated}\n` +
                                 `- Membros removidos: ${membersRemoved}`;

            console.log(replyMessage);
            await interaction.editReply({ content: replyMessage });

        } catch (error) {
            console.error('[SYNC_MEMBERS_CMD] Erro ao sincronizar membros:', error.message);
            if (error.response) {
                console.error('[SYNC_MEMBERS_CMD] Detalhes do erro API:', error.response.data, error.response.status);
            }
            await interaction.editReply({ content: 'Ocorreu um erro durante a sincronização. Verifique os logs.' });
        }
    },
};