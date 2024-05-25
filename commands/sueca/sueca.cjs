const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sueca')
        .setDescription('🃏 Jogar uma bela duma Sueca com os rapazis '),
    async execute(interaction) {
        interaction.reply({ content: '**:spades: :hearts:  Aquela suecada dja bu sabi modi. - A abrir nova mesa :clubs: :diamonds:**' });

    },
};