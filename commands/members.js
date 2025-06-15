const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('members')
        .setDescription('Lista todos os membros da guilda registrados, em ordem alfabética.'),
    async execute(interaction) {
        const { GuildMember } = interaction.client.db;

        try {
            await interaction.deferReply(); // Deferir para dar tempo de buscar no DB

            const members = await GuildMember.findAll({
                order: [['Name', 'ASC']], // Ordena por nome em ordem ascendente
            });

            if (!members || members.length === 0) {
                return interaction.editReply({ content: 'Nenhum membro encontrado no banco de dados.' });
            }

            // Dividir a lista de membros em pedaços para não exceder o limite de caracteres do Discord
            const memberChunks = [];
            let currentChunk = '';
            for (const member of members) {
                const memberLine = `${member.Name}\n`; // Simplesmente o nome
                if (currentChunk.length + memberLine.length > 1900) { // Limite seguro para descrição de embed ou conteúdo de mensagem
                    memberChunks.push(currentChunk);
                    currentChunk = '';
                }
                currentChunk += memberLine;
            }
            if (currentChunk) {
                memberChunks.push(currentChunk);
            }

            if (memberChunks.length === 0) {
                 return interaction.editReply({ content: 'Nenhum membro para listar após a formatação.' });
            }

            const totalMembers = members.length;

            // Enviar o primeiro chunk como resposta inicial
            const firstEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Membros da Guilda (${totalMembers}) - Página 1/${memberChunks.length}`)
                .setDescription(memberChunks[0])
                .setTimestamp();

            await interaction.editReply({ embeds: [firstEmbed] });

            // Enviar chunks subsequentes como mensagens de acompanhamento
            for (let i = 1; i < memberChunks.length; i++) {
                const subsequentEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Membros da Guilda - Página ${i + 1}/${memberChunks.length}`)
                    .setDescription(memberChunks[i])
                    .setTimestamp();
                await interaction.followUp({ embeds: [subsequentEmbed], ephemeral: interaction.ephemeral }); // Manter ephemeral se a original for
            }

        } catch (error) {
            console.error('[MEMBERS_CMD] Erro ao listar membros:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Ocorreu um erro ao buscar a lista de membros.', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'Ocorreu um erro ao buscar a lista de membros.' });
            }
        }
    },
};