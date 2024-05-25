import url from 'url';
import { createRequire } from 'module';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import { EmbedBuilder, Client, GatewayIntentBits, Events, Partials, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Collection } from 'discord.js';

import { GameConfig, GamePlayer, Cards, Guilds, InitFormAutocompletes, InitFormButtons, WhisperButtons, GameState, GameOverEmbedActions, RenunciaActions } from './classes.js';

// stuff for commands deploy
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// devmode
export const devmode = true;
export const devmode2 = false; // numero de players no aarray da renuncia hardcoded
export const devModeVOICHANNELID = '510206902135685133'; // não esquecer de alterar para o canal de voice ond estamos

// secrets
const { TOKEN, GUILDID, TEXTCHANNELID, VOICECHANNELID, CLIENTID } = require('./config.json');

// server and channel info
let GUILD = null;
let VOICECHANNEL = null;
let VOICECHANNELCONNECTION = null;
let AUDIOPLAYER = createAudioPlayer();
let bgmMusicLoop = false;

// game state
let gameConfig = null;
let gameState = null;

// client
const CLIENT = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildVoiceStates],

	partials: [
		Partials.Message,
		Partials.Channel],
});

// commands
CLIENT.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.cjs'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			CLIENT.commands.set(command.data.name, command);
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// listeners
CLIENT.on(Events.Error, console.error);
CLIENT.on(Events.InteractionCreate, interactionInit);

// login
CLIENT.once(Events.ClientReady, () => { onLogin(); });
CLIENT.login(TOKEN);

function onLogin() {
	GUILD = CLIENT.guilds.cache.get(GUILDID);
	VOICECHANNEL = GUILD.channels.cache.find(channel => channel.id === (devmode ? devModeVOICHANNELID : VOICECHANNELID));

	console.log(`Ready to GO! _ ${CLIENT.user.tag}!`);
}

async function interactionInit(interaction) {
	// interaction.message.delete(); return;
	// commands
	if (interaction.isChatInputCommand()) {

		// ignoring everything but /sueca commands from sueda text channel
		if (interaction.channelId !== TEXTCHANNELID || interaction.commandName !== 'sueca') { return; }

		// if a gametable is already open, ignore the command
		if (!!gameConfig) { return; }

		const command = interaction.client.commands.get(interaction.commandName);
		await command.execute(interaction).then(_ => { setTimeout(() => { botTriggered(interaction); }, ((devmode && !devmode2) ? 1000 : 3000)); });
	}

	// autocompletes
	if (interaction.isStringSelectMenu()) {

		// init form autocomplete
		if (Object.values(InitFormAutocompletes).includes(interaction.customId)) {
			initAutocompleteChange(interaction);
			return;
		}

		// whisper autocomplete
		switch (interaction.customId) {
			case WhisperButtons.CARDSELECTED:
				cardSelected(interaction);
				return;
		}

		// renuncia automplete
		switch (interaction.customId) {
			case RenunciaActions.TARGET:
				interaction.deferUpdate();
				gameState.renunciasMap.set(interaction.user.id, interaction.values[0]);
				return;
		}
	}

	// buttons
	if (interaction.isButton()) {

		// init form
		if (Object.values(InitFormButtons).includes(interaction.customId)) {
			initButtonClick(interaction);
			return;
		}

		// whisper
		switch (interaction.customId) {
			case WhisperButtons.CARDPLAYED:
				cardPlayed(interaction);
				return;
		}

		// gameover form
		if (Object.values(GameOverEmbedActions).includes(interaction.customId)) {
			gameOverButtonClick(interaction);
			return;
		}

		// renuncia
		if (Object.values(RenunciaActions).includes(interaction.customId)) {
			renunciaButtonClick(interaction);
			return;
		}
	}
}

function botTriggered(interaction) {
	areThereEnoughPlayers() ? gameIntroduction(interaction) : notEnoughPlayers(interaction);
}

function areThereEnoughPlayers() {
	return devmode || VOICECHANNEL.members.size >= 4;
}

function notEnoughPlayers(interaction) {
	interaction.editReply({ content: '⛔ Pra à Sueca são precisos 4. **Arranca contigo sócio.** ⛔' });
	setTimeout(() => { interaction.deleteReply(); }, 3000);
}

function gameIntroduction(interaction) {
	interaction.editReply(getGameStartForm(0));
	botVoiceIntroduction();
	gameConfig = new GameConfig();
}

function initAutocompleteChange(interaction) {
	interaction.deferUpdate();
	const gamePlayer = new GamePlayer();
	gamePlayer.id = interaction.values[0].split('#')[0];
	gamePlayer.name = interaction.values[0].split('#')[1];

	if (interaction.customId === InitFormAutocompletes.DEALER) { gameConfig.dealer = gamePlayer.id; }
	else if (interaction.customId === InitFormAutocompletes.TRUNFO) { gameConfig.trunfo = interaction.values[0]; }
	else { gameConfig.players.set(interaction.customId, gamePlayer); }
}

function initButtonClick(interaction) {
	switch (interaction.customId) {
		case InitFormButtons.CANCEL:
			closeGameTable(interaction);
			break;
		case InitFormButtons.NEXT:
			interaction.update(getGameStartForm(1));
			break;
		case InitFormButtons.PREVIOUS:
			interaction.update(getGameStartForm(0));
			break;
		case InitFormButtons.START:
			usersWantToStartTheGame(interaction);
			break;
	}
}

function closeGameTable(interaction) {
	interaction.message.delete();
	gameConfig = null;
	gameState = null;
	botVoiceGoodbye();
}

function usersWantToStartTheGame(interaction) {
	isGameConfigValid() ? gameStart(interaction) : gameConfigInvalid(interaction);
}

function isGameConfigValid() {
	if (devmode) { return true; }
	if (!gameConfig.dealer || !gameConfig.trunfo) { return false; }
	const players = [];
	for (let i = 1; i <= 4; i++) {
		if (!gameConfig.players.get(`player${i}`).id || !gameConfig.players.get(`player${i}`).name) { return false; } // all 4 players required
		if (players.includes(gameConfig.players.get(`player${i}`).id)) { return false; } // no duplicated players
		players.push(gameConfig.players.get(`player${i}`).id);
	}
	return true;
}

function gameConfigInvalid(interaction) {
	interaction.update({ content: '**⛔ Ou faltam jogadores, ou existem jogadores repetidos. Não te esqueças também de escolher o dealer e a origem trunfo!** ⛔' });
}

function gameStart(interaction) {
	botVoiceGameStart();
	let dealerIndex = 0;
	for (let i = 1; i <= 4; i++) {
		if (gameConfig.players.get(`player${i}`).id === gameConfig.dealer) {
			dealerIndex = i;
			break;
		}
	}
	gotoShuffeling(interaction, dealerIndex);
}

function gotoShuffeling(interaction, dealerIndex) {
	interaction.update({ content: `💫 O **${gameConfig.players.get(`player${dealerIndex}`).name}** está a baralhar o mambo. `, components: [] });

	setTimeout(() => {
		const playerIndex = (dealerIndex + 2 > 4 ? dealerIndex + 2 - 4 : dealerIndex + 2);
		interaction.editReply({ content: `🔪 O **${gameConfig.players.get(`player${playerIndex}`).name}** está a cortar o beat. ` });
	}, ((devmode && !devmode2) ? 500 : 3500));

	setTimeout(() => {
		const playerIndex = (dealerIndex + 3 > 4 ? dealerIndex + 3 - 4 : dealerIndex + 3);
		interaction.editReply({ content: `📦 O **${gameConfig.players.get(`player${playerIndex}`).name}** está a distribuir o brinde. ` });
	}, ((devmode && !devmode2) ? 1000 : 5000));

	setTimeout(() => { gameDraw(interaction, dealerIndex); }, ((devmode && !devmode2) ? 1500 : 8000));
}

function gameDraw(interaction, dealerIndex) {
	if (!gameState) { gameState = new GameState(); }
	else { gameState.shuffleNewDeck(); };
	gameState.currentPlayer = dealerIndex;
	gameState.interaction = interaction;
	gameState.gameConfig = gameConfig;
	gameState.setTrunfo();
	timeToPlay();
}

function timeToPlay() {

	const whosTurnContent = `🤠 Está na vez do **${gameConfig.players.get(`player${gameState.currentPlayer}`).name}** jogar.`;
	const trunfoContent = `👑 O trunfo é ${gameState.getNaipeName(gameState.trunfo)}.`;
	const pileContent = `🃏 Na mesa temos: ${gameState.getPileText()}`;

	const renunciaButton = [new ButtonBuilder().setCustomId(RenunciaActions.TRIGGER).setLabel('🛂 Renúncia!!').setStyle(ButtonStyle.Danger)];
	const buttonsRow = [];

	let content = whosTurnContent + ' ' + trunfoContent;
	if (!!gameState.pile.length) {
		const previouslyTurnContent = `🔄 Na jogada anterior, o **${gameConfig.players.get(`player${gameState.currentPlayer - 1 === 0 ? 4 : gameState.currentPlayer - 1}`).name}** lançou ${gameState.getPileText([gameState.pile.at(-1)])}`;
		content = previouslyTurnContent + '\n' + content;
		content += '\n' + pileContent;
	}
	if (!!gameState.previousRound) { content += '\n' + `🧹 A equipa ${gameState.previousRound.winningTeam} varreu a ronda anterior, levaram ${gameState.previousRound.score} pontos para o cubico. ` + gameState.getPileText(gameState.previousRound.pile); }
	if (!!gameState.pile.length || !!gameState.previousRound) { buttonsRow.push(new ActionRowBuilder().addComponents(renunciaButton)); };

	gameState.interaction.editReply({ content: content, components: buttonsRow, embeds: getEmbedsForCards(gameState.pile) });
	whisperTimeToPlay();
}

function whisperTimeToPlay() {
	const userIDtoDM = gameConfig.players.get(`player${gameState.currentPlayer}`).id;

	CLIENT.users.fetch(userIDtoDM).then(user => {
		user.send(getCardPlayForm());
	});
}

function cardSelected(interaction) {
	gameState.setTempCard(interaction.values[0]);
	interaction.deferUpdate();
}

function cardPlayed(interaction) {
	if (!gameState.tempCard) { interaction.update({ content: '**⛔ Não escolheste uma carta para jogar!!** ⛔' + '\n' + interaction.message.content }); return; }
	interaction.message.delete();
	if (!!gameState.renunciaTrigger) { renunciaEndScreen(gameState.renunciaTrigger); return; }
	gameState.nextMove();
	gameState.isRoundOver() ? roundEnded() : timeToPlay();
}

function roundEnded() {
	gameState.checkForRoundWinner();
	gameState.isGameOver() ? gameEnded() : timeToPlay();
}

function gameEnded() {
	let content = `🧹 A equipa ${gameState.previousRound.winningTeam} varreu a última ronda, levaram ${gameState.previousRound.score} pontos para o cubico. ` + gameState.getPileText(gameState.previousRound.pile);
	content += '\n\n📣 **Jogo feito, nada mais.** A calcular o resultado final, sigurem-se... 📣';

	gameState.interaction.editReply({ content: content, embeds: [] });
	gameState.calcTeamScores();

	setTimeout(() => {
		!!gameState.renunciaTrigger
			? renunciaEndScreen(gameState.renunciaTrigger)
			: gameEndedScoreboard();
	}, ((devmode && !devmode2) ? 1000 : 10000));
}

function gameEndedScoreboard() {
	botVoiceGameEnd();
	const close = new ButtonBuilder().setCustomId(GameOverEmbedActions.END).setLabel('🚫 Fechar mesa').setStyle(ButtonStyle.Danger);
	const reset = new ButtonBuilder().setCustomId(GameOverEmbedActions.RESET).setLabel('🧽 Limpar acomulados').setStyle(ButtonStyle.Primary);
	const next = new ButtonBuilder().setCustomId(GameOverEmbedActions.MORE).setLabel('🃏 Novo jogo').setStyle(ButtonStyle.Success);
	const buttonsRow = new ActionRowBuilder().addComponents(close, reset, next);

	let content = gameState.gameScore.teamA === gameState.gameScore.teamB
		? '🤝 Aquele empatezinho técnico, quem nunca! 🤝'
		: `🎊 E o vencedor dessa porra foi a **Equipa ${gameState.gameScore.teamA > gameState.gameScore.teamB ? 'A' : 'B'}**. Parabéns seus animais. 🎊${gameState.checkForCapote() ? ' 🔫 **Capote** nessa porra, o rabinho deles não aguenta! 💩' : ''}`;

	content += `\n🔷 Resultado do jogo: **Equipa A** [${gameState.gameScore.teamA}] - [${gameState.gameScore.teamB}] **Equipa B** 🔷`;
	content += `\n🔶 Resultado acomulado: **Equipa A** [${gameState.continuousScore.teamA}] - [${gameState.continuousScore.teamB}] **Equipa B** 🔶`;

	const initFormPage2 = getGameStartForm(1);
	initFormPage2.components.pop(); // we dont want the buttonsRow
	gameState.interaction.editReply({ content: content, components: [...initFormPage2.components, buttonsRow] });
}

function gameOverButtonClick(interaction) {
	switch (interaction.customId) {
		case GameOverEmbedActions.END:
			closeGameTable(interaction);
			break;
		case GameOverEmbedActions.MORE:
			gameStart(interaction);
			break;
		case GameOverEmbedActions.RESET:
			gameState.resetContinousScores();
			// interaction.deferUpdate();
			let content = interaction.message.content;
			const regex = /\[[0-9]+\]/g;
			content = content.replaceAll(regex, '[0]');
			content = '**🧽 Os resultados acomulados foram limpos!! 🧽**' + '\n\n' + content;
			interaction.update({ content: content });
			break;
	}
}

// 📃 forms
function getGameStartForm(page) {
	const playersArray = [];
	VOICECHANNEL.members.forEach(member => {
		if (member.id === CLIENTID) { return; }
		playersArray.push(new StringSelectMenuOptionBuilder().setLabel(member.displayName).setValue(member.id + '#' + member.displayName));
	});

	if (page === 0) {
		const player1 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER1).setPlaceholder('👲 Jogador 1').addOptions(playersArray);
		const player2 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER2).setPlaceholder('🤶 Jogador 2').addOptions(playersArray);
		const player3 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER3).setPlaceholder('👳‍♂️ Jogador 3').addOptions(playersArray);
		const player4 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER4).setPlaceholder('👨‍🦰 Jogador 4').addOptions(playersArray);
		const player1Row = new ActionRowBuilder().addComponents(player1);
		const player2Row = new ActionRowBuilder().addComponents(player2);
		const player3Row = new ActionRowBuilder().addComponents(player3);
		const player4Row = new ActionRowBuilder().addComponents(player4);

		const cancel = new ButtonBuilder().setCustomId(InitFormButtons.CANCEL).setLabel('🚫 Cancelar jogatana').setStyle(ButtonStyle.Danger);
		const next = new ButtonBuilder().setCustomId(InitFormButtons.NEXT).setLabel('⏩ Seguinte').setStyle(ButtonStyle.Primary);
		const buttonsRow = new ActionRowBuilder().addComponents(cancel, next);

		return {
			content: '**Façam as equipas** - 👲👳‍♂️ vs 🤶👨‍🦰 - Jogador 1 e 3 fazem parte da equipa A; Jogador 2 e 4 fazem parte da equipa B.',
			components: [player1Row, player2Row, player3Row, player4Row, buttonsRow],
		};
	}

	if (page === 1) {

		const dealer = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.DEALER).setPlaceholder('Quem é que vai baralhar o beat?').addOptions(playersArray);
		const dealerRow = new ActionRowBuilder().addComponents(dealer);

		const trunfo = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.TRUNFO).setPlaceholder('O trunfo vem de cima ou baixo?').addOptions([
			new StringSelectMenuOptionBuilder().setValue('up').setLabel('🔼 Cima'),
			new StringSelectMenuOptionBuilder().setValue('down').setLabel('🔽 Baixo'),
		]);
		const trunfoRow = new ActionRowBuilder().addComponents(trunfo);

		const cancel = new ButtonBuilder().setCustomId(InitFormButtons.CANCEL).setLabel('🚫 Cancelar jogatana').setStyle(ButtonStyle.Danger);
		const previous = new ButtonBuilder().setCustomId(InitFormButtons.PREVIOUS).setLabel('⏪ Anterior').setStyle(ButtonStyle.Secondary);
		const start = new ButtonBuilder().setCustomId(InitFormButtons.START).setLabel('🃏 Começar jogo').setStyle(ButtonStyle.Success);
		const buttonsRow = new ActionRowBuilder().addComponents(cancel, previous, start);

		return {
			content: '**🃏 Definam quem vai baralhar o beat, e de onde vem o trunfo.**',
			components: [dealerRow, trunfoRow, buttonsRow],
		};
	}
}

function getCardPlayForm() {
	const cardsArray = [];
	gameState[`player${gameState.currentPlayer}Hand`].forEach(card => {
		let cardLabel = '';

		for (const [key, value] of Object.entries(Cards)) {
			if (card.id !== value) { continue; }
			cardLabel = (key.at(0) + key.slice(1).toLowerCase());
		}

		Object.entries(Guilds).forEach(([key, value]) => {
			if (card.guild !== value) { return; }
			cardLabel += (' de ' + key.at(0) + key.slice(1).toLowerCase());
		});

		if (card.guild === gameState.trunfo) { cardLabel += ' 👑'; }
		if (!!gameState.pile.length && card.guild === gameState.pile[0].guild) { cardLabel += ' 🛂'; }

		cardsArray.push(new StringSelectMenuOptionBuilder().setLabel(cardLabel).setValue(card.guild + '#' + card.id));
	});


	const playerHand = new StringSelectMenuBuilder().setCustomId(WhisperButtons.CARDSELECTED).setPlaceholder('🃏 A Minha mão').addOptions(cardsArray);
	const playerHandRow = new ActionRowBuilder().addComponents(playerHand);

	const go = new ButtonBuilder().setCustomId(WhisperButtons.CARDPLAYED).setLabel('🃏 Jogar carta').setStyle(ButtonStyle.Success);
	const buttonsRow = new ActionRowBuilder().addComponents(go);

	const firstPlayerContent = 'Não existem cartas na mesa.';
	const notFirstPlayerContent = 'Na mesa estão as seguintes cartas: ' + gameState.getPileText();

	return {
		content: `**🃏 Escolhe a carta que queres jogar. O trunfo é ${gameState.getNaipeName(gameState.trunfo)}.** - ` + (!!gameState.pile.length ? notFirstPlayerContent : firstPlayerContent) + ((devmode && !devmode2) ? ` Este é o player numero ${gameState.currentPlayer}` : ''),
		components: [playerHandRow, buttonsRow],
		embeds: getEmbedsForCards(gameState.pile),
	};
}


function getRenunciaForm() {
	let playersArray = [];
	gameConfig.players.forEach(player => {
		playersArray.push(new StringSelectMenuOptionBuilder().setLabel(player.name).setValue(player.id));
	});

	if (devmode && !devmode2) { playersArray = [playersArray[0]]; }
	if (devmode2) { playersArray = [playersArray[0], playersArray[1]]; }

	const renuncia = new StringSelectMenuBuilder().setCustomId(RenunciaActions.TARGET).setPlaceholder('🎯 Jogador').addOptions(playersArray);
	const renunciaRow = new ActionRowBuilder().addComponents(renuncia);

	const cancel = new ButtonBuilder().setCustomId(RenunciaActions.CANCEL).setLabel('🚫 Cancelar').setStyle(ButtonStyle.Danger);
	const denounce = new ButtonBuilder().setCustomId(RenunciaActions.CONFIRM).setLabel('🛂 Denunciar jogador').setStyle(ButtonStyle.Primary);

	const buttonsRow = new ActionRowBuilder().addComponents(cancel, denounce);

	return { content: '**🕵️‍♂️ Identifica o intruja que achas que fez renúncia**', components: [renunciaRow, buttonsRow] };
}

function renunciaEndScreen(acuserID) {
	const acuserName = gameState.getPlayerNameByID(acuserID);
	const offenderID = gameState.renunciasMap.get(acuserID);
	const offenderName = gameState.getPlayerNameByID(offenderID);
	const offenderIndex = gameState.getPlayerIndexByID(offenderID);

	// assuming the renuncia is correct
	let winner = !(offenderIndex % 2) ? 'teamA' : 'teamB';
	let loser = !!(offenderIndex % 2) ? 'teamA' : 'teamB';

	let content = `📞📺 **ALERTA CM:** O jogador ${acuserName} acusou o jogador ${offenderName} de renúncia!! 😱😱`;
	gameState.interaction.editReply({ content: content, components: [], embeds: [] });

	if (gameState.isPlayerRenunciaCorrect(acuserID)) {
		content = `✅✅✅ **E ele estava certo!** O ${offenderName} quebrou as regras na ronda ${gameState.renunciaRound}, e á pala dessa brincadeira, a Equipa ${loser.at(-1)} levou capote neste jogo! 💩`;
	}
	else {
		// assumption failed, switcherooo
		winner = !!(offenderIndex % 2) ? 'teamA' : 'teamB';
		loser = !(offenderIndex % 2) ? 'teamA' : 'teamB';
		content = `❌❌❌ **Mas ele estava errado! O ${offenderName} não quebrou as regras neste jogo! Para não dares para esperto, a Equipa ${loser.at(-1)} vai levar um capotinho cambuá nesse jogo.** 💩`;
	}

	gameState.gameScore[winner] = 120;
	gameState.gameScore[loser] = 0;
	gameState.continuousScore[winner] += 3;

	setTimeout(() => { gameState.interaction.editReply({ content: content, components: [] }); }, 5000);
	setTimeout(() => { gameEndedScoreboard(); }, 15000);
}

function renunciaButtonClick(interaction) {
	switch (interaction.customId) {
		case RenunciaActions.TRIGGER:
			interaction.deferUpdate();
			CLIENT.users.fetch(interaction.user.id).then(user => { user.send(getRenunciaForm()); });
			break;
		case RenunciaActions.CONFIRM:
			if (!gameState.renunciasMap.has(interaction.user.id)) {
				interaction.update({ content: '**⛔ Não escolheste um joogador para denunciar!! ⛔**' + '\n' + interaction.message.content }); return;
			}
			gameState.triggerRenuncia(interaction.user.id);
			interaction.message.delete();
			break;
		case RenunciaActions.CANCEL:
			if (gameState.renunciasMap.has(interaction.user.id)) { gameState.renunciasMap.delete(interaction.user.id); }
			interaction.message.delete();
			break;
	}
}

function botVoiceGameEnd() {
	bgmMusicLoop = false;
	const src = createAudioResource('./audio/gameover.mp3');
	AUDIOPLAYER.play(src);
}

function botVoiceGameStart() {
	bgmMusicLoop = true;
	let src = createAudioResource('./audio/bgm.mp3');
	AUDIOPLAYER.play(src);
	AUDIOPLAYER.on(AudioPlayerStatus.Idle, () => { if (bgmMusicLoop) { src = createAudioResource('./audio/bgm.mp3'); AUDIOPLAYER.play(src); }; });
}

function botVoiceGoodbye() {
	const src = createAudioResource('./audio/goodbye.mp3');
	AUDIOPLAYER.play(src);
	AUDIOPLAYER.on('idle', () => { VOICECHANNELCONNECTION.destroy(); AUDIOPLAYER = createAudioPlayer(); });
}

function botVoiceIntroduction() {
	getVoiceChannelConfig().then(voiceChannel => {
		VOICECHANNELCONNECTION = voiceChannel;
		VOICECHANNELCONNECTION.subscribe(AUDIOPLAYER);
		const src = createAudioResource('./audio/intro.mp3');
		AUDIOPLAYER.play(src);
	});
}

async function getVoiceChannelConfig() {
	return joinVoiceChannel({
		channelId: VOICECHANNEL.id,
		guildId: VOICECHANNEL.guild.id,
		adapterCreator: VOICECHANNEL.guild.voiceAdapterCreator,
	});
};

// v3 - 30secs to autoplay; 3 autoplays dá capote (anti-afk).

function getCardImgUrl(card) {
	let cardUrl = 'https://mambosinfinitos.pt/discobots/sueca/cards/';

	if ([Cards.ÁS, Cards.VALETE, Cards.DAMA, Cards.REI].includes(+card.id)) {
		switch (+card.id) {
			case Cards.ÁS:
				cardUrl += 'ace';
				break;
			case Cards.VALETE:
				cardUrl += 'jack';
				break;
			case Cards.DAMA:
				cardUrl += 'queen';
				break;
			case Cards.REI:
				cardUrl += 'king';
				break;
		}
	}
	else {
		cardUrl += card.id;
	}
	cardUrl += `_of_${card.guild}.png`;
	return cardUrl;
}

function getEmbedsForCards(pile) {
	const embeds = [];

	pile.reverse().forEach((card, i) => {
		embeds.push(new EmbedBuilder()
			.setColor([Guilds.COPAS, Guilds.OUROS].includes(card.guild) ? 0xFF0000 : 0x000000) // red or black according to card cuild
			// .setTitle(gameState.getCardName(card).replace('[','').replace(']',''))
			.setThumbnail(getCardImgUrl(card)),
			// .setDescription(`O jogador ${gameState.gameConfig.players.get(`player${gameState.currentPlayer - i + 1 === 0 ? 4 : gameState.currentPlayer - i + 1}`).name}\njogou ${gameState.getCardName(card.name).replace('[','').replace(']','')}`),
		);
	});
	return embeds;
}