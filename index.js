import { Client, GatewayIntentBits, Events, Partials, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Collection } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import { GameConfig, GamePlayer, cardIDs, cardGuilds, initFormIDs, initFormActionIDs, whisperActions, GameState, endGameActions } from './classes.js';
import { createRequire } from 'module';
import url from 'url';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { TOKEN, GUILDID, TEXTCHANNELID, VOICECHANNELID } = require('./config.json');

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


let GUILD = null;
let VOICECHANNEL = null;
let TEXTCHANNEL = null;

let gameConfig = null;
let gameState = null;

/**  press play ****/
CLIENT.once(Events.ClientReady, () => { loggedIn(); });
CLIENT.on(Events.Error, console.error);
CLIENT.on(Events.InteractionCreate, interactionInit);

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


CLIENT.login(TOKEN);


function loggedIn() {
	console.log(`Ready to GO! _ ${CLIENT.user.tag}!`);
	GUILD = CLIENT.guilds.cache.get(GUILDID);
	VOICECHANNEL = GUILD.channels.cache.find(channel => channel.id === '510206902135685133');
	TEXTCHANNEL = GUILD.channels.cache.find(channel => channel.id === TEXTCHANNELID);
}

async function interactionInit(interaction) {
	if (interaction.isChatInputCommand() && interaction.channelId === TEXTCHANNELID) {
		const command = interaction.client.commands.get(interaction.commandName);
		await command.execute(interaction).then(_ => { setTimeout(() => { botTriggered(interaction); }, 3000); });
	}

	// autocompletes
	if (interaction.isStringSelectMenu()) {
		// init form autocomplete
		if (Object.values(initFormIDs).includes(interaction.customId)) {
			initAutocompleteChange(interaction);
		}

		switch (interaction.customId) {
			case whisperActions.CARDSELECTED:
				cardSelected(interaction);
				break;
		}

	}

	// buttons
	if (interaction.isButton()) {
		// init form buttons
		if (Object.values(initFormActionIDs).includes(interaction.customId)) {
			initButtonClick(interaction);
		}

		switch (interaction.customId) {
			case whisperActions.CARDPLAYED:
				cardPlayed(interaction);
				break;
		}

		if (Object.values(endGameActions).includes(interaction.customId)) {
			endGameButtonClick(interaction);
		}

	}
}

function initAutocompleteChange(interaction) {
	interaction.deferUpdate();
	const gamePlayer = new GamePlayer();
	gamePlayer.id = interaction.values[0].split('#')[0];
	gamePlayer.name = interaction.values[0].split('#')[1];

	if (interaction.customId === initFormIDs.DEALER) { gameConfig.dealer = gamePlayer.id; }
	else { gameConfig.players.set(interaction.customId, gamePlayer); }
}

function initButtonClick(interaction) {
	switch (interaction.customId) {
		case initFormActionIDs.CANCEL:
			cancelGameCreation(interaction);
			break;
		case initFormActionIDs.NEXT:
			interaction.update(getGameStartForm(1));
			break;
		case initFormActionIDs.PREVIOUS:
			interaction.update(getGameStartForm(0));
			break;
		case initFormActionIDs.START:
			usersAreReadyToGO(interaction);
			break;
	}

}

function endGameButtonClick(interaction) {

	switch (interaction.customId) {
		case endGameActions.MORE:
			newGameRound();
			break;
		case endGameActions.RESET:
			newGameRound(true);
			break;
		case endGameActions.END:
			endGameCloseAction(interaction);
			break;
	}

}


function botTriggered(interaction) {
	!areThereEnoughPlayers() ? gameIntroduction(interaction) : notEnoughPlayers(interaction);
}


function areThereEnoughPlayers() {
	return VOICECHANNEL.members.size === 4;
}


function notEnoughPlayers(interaction) {
	interaction.editReply({ content: 'not enuff players' });
	setTimeout(() => {
		interaction.deleteReply();
	}, 3000);
}

//
function gameIntroduction(interaction) {
	botVoiceIntroduction();
	interaction.editReply(getGameStartForm(0));
	gameConfig = new GameConfig();
}

function botVoiceIntroduction() {
	// bot entra na sala e toca um clip inicial
}


function getGameStartForm(page) {

	// construção do formulário inicial
	const playersArray = [];
	VOICECHANNEL.members.forEach(member => {
		playersArray.push(new StringSelectMenuOptionBuilder().setLabel(member.displayName).setValue(member.id + '#' + member.displayName));
	});


	if (page === 0) {
		// select menus
		const player1 = new StringSelectMenuBuilder().setCustomId(initFormIDs.PLAYER1).setPlaceholder('Jogador 1').addOptions(playersArray);
		const player2 = new StringSelectMenuBuilder().setCustomId(initFormIDs.PLAYER2).setPlaceholder('Jogador 2').addOptions(playersArray);
		const player3 = new StringSelectMenuBuilder().setCustomId(initFormIDs.PLAYER3).setPlaceholder('Jogador 3').addOptions(playersArray);
		const player4 = new StringSelectMenuBuilder().setCustomId(initFormIDs.PLAYER4).setPlaceholder('Jogador 4').addOptions(playersArray);

		const player1Row = new ActionRowBuilder().addComponents(player1);
		const player2Row = new ActionRowBuilder().addComponents(player2);
		const player3Row = new ActionRowBuilder().addComponents(player3);
		const player4Row = new ActionRowBuilder().addComponents(player4);

		// action buttons
		const cancel = new ButtonBuilder().setCustomId(initFormActionIDs.CANCEL).setLabel('Abortar jogo').setStyle(ButtonStyle.Danger);
		const next = new ButtonBuilder().setCustomId(initFormActionIDs.NEXT).setLabel('Próxima página').setStyle(ButtonStyle.Primary);

		const buttonsRow = new ActionRowBuilder().addComponents(cancel, next);


		return {
			content: '**Configura os players**',
			components: [player1Row, player2Row, player3Row, player4Row, buttonsRow],
		};
	}

	if (page === 1) {
		// select menus
		const dealer = new StringSelectMenuBuilder().setCustomId(initFormIDs.DEALER).setPlaceholder('Quem é que baralha o beat').addOptions(playersArray);
		const dealerRow = new ActionRowBuilder().addComponents(dealer);

		// action buttons
		const cancel = new ButtonBuilder().setCustomId(initFormActionIDs.CANCEL).setLabel('Abortar jogo').setStyle(ButtonStyle.Danger);
		const previous = new ButtonBuilder().setCustomId(initFormActionIDs.PREVIOUS).setLabel('Página anterior').setStyle(ButtonStyle.Secondary);
		const start = new ButtonBuilder().setCustomId(initFormActionIDs.START).setLabel('Começar jogo').setStyle(ButtonStyle.Success);

		const buttonsRow = new ActionRowBuilder().addComponents(cancel, previous, start);

		return {
			content: '**Escolhe quem baralha o beat**',
			components: [dealerRow, buttonsRow],
		};
	}
}


function cancelGameCreation(interaction) {
	interaction.message.delete();
	gameConfig = null;
	botVoiceGoodbye();
}

function botVoiceGoodbye() {
	// toca um audio clip e sai do canal
}


function usersAreReadyToGO(interaction) {
	// botão para começar o jogo
	isGameConfigValid(interaction) ? gameStart(interaction) : gameConfigInvalid(interaction);
}


function isGameConfigValid(interaction) {
	if (!gameConfig.dealer) { return false; }
	for (let i = 1; i <= 4; i++) {
		if (!gameConfig.players.get(`player${i}`).id || !gameConfig.players.get(`player${i}`).name) { return false; }
	}
	return true;
}

function gameConfigInvalid(interaction) {
	interaction.update({ content: '**faltam mambos g**' });
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
	getShuffelingMessage(interaction, dealerIndex);


	// atualizar mensagem c/ getShuffelingMessage(dealerIndex); <- gif com timer
	// atualizar mensagem c/ getCuttingMessage(dealerIndex); <- gif com timmer
	// atualizar mensagem c/ getDrawingMessage(dealerIndex); <- gif com timmer
}

function botVoiceGameStart() {
	// form okay, lets go. dá uma musiquinha de leve tipo jazz. de vez em quando manda uma bufa e manda uma caralhada
}

function getShuffelingMessage(interaction, dealerIndex) {
	interaction.update({ content: `O ${gameConfig.players.get(`player${dealerIndex}`).name} está a baralhar`, components: [] });

	setTimeout(() => {
		getCuttingMessage(interaction, dealerIndex);
	}, 3000);
}

function getCuttingMessage(interaction, dealerIndex) {
	const playerIndex = (dealerIndex + 2 > 4 ? dealerIndex - 2 : dealerIndex + 2);
	interaction.editReply({ content: `O ${gameConfig.players.get(`player${playerIndex}`).name} está a cortar` });

	setTimeout(() => {
		getDrawingMessage(interaction, dealerIndex);
	}, 3000);
}

function getDrawingMessage(interaction, dealerIndex) {
	const playerIndex = (dealerIndex + 3 > 4 ? dealerIndex - 1 : dealerIndex + 3);
	interaction.editReply({ content: `O ${gameConfig.players.get(`player${playerIndex}`).name} está a distribuir` });

	setTimeout(() => {
		gameDraw(interaction, dealerIndex);
	}, 3000);

}

function gameDraw(interaction, dealerIndex) {
	gameState = new GameState();
	gameState.currentPlayer = dealerIndex;
	gameState.interaction = interaction;
	gameState.gameConfig = gameConfig;
	timeToPlay(true);
}


function timeToPlay(firstRound = false) {
	// atualiza mensagem para o jogador X jogar
	if (!firstRound) { gameState.incrementPlayer(); }
	gameState.interaction.editReply({ content: `Está na vez do ${gameConfig.players.get(`player${gameState.currentPlayer}`).name}` });
	whipserTimeToPlay();
}

function whipserTimeToPlay() {
	// envia dm privada para
	const userIDtoDM = gameConfig.players.get(`player${gameState.currentPlayer}`).id;

	CLIENT.users.fetch(userIDtoDM).then(user => {
		const form = getCardPlayForm();
		user.send(form);
	});

}

function getCardPlayForm() {
	const cardsArray = [];
	gameState[`player${gameState.currentPlayer}Hand`].forEach(card => {

		let cardLabel = '';
		Object.entries(cardIDs).forEach(([key, value]) => {
			if (card.id !== value) { return; }
			cardLabel = (key.at(0) + key.slice(1).toLowerCase());
		});

		Object.entries(cardGuilds).forEach(([key, value]) => {
			if (card.guild !== value) { return; }
			cardLabel += (' de ' + key.at(0) + key.slice(1).toLowerCase());
		});
		cardsArray.push(new StringSelectMenuOptionBuilder().setLabel(cardLabel).setValue(card.guild + '#' + card.id));
	});


	const playerHand = new StringSelectMenuBuilder().setCustomId(whisperActions.CARDSELECTED).setPlaceholder('A Minha mão').addOptions(cardsArray);
	const playerHandRow = new ActionRowBuilder().addComponents(playerHand);

	// action buttons
	const go = new ButtonBuilder().setCustomId(whisperActions.CARDPLAYED).setLabel('Jogar carta').setStyle(ButtonStyle.Success);

	const buttonsRow = new ActionRowBuilder().addComponents(go);


	return {
		content: '**Escolhe o que vais jogar **',
		components: [playerHandRow, buttonsRow],
	};
}

function cardSelected(interaction) {
	// quando o jogador seleciona uma carta
	gameState.setTempCard(interaction.values[0]);
	interaction.deferUpdate();
}


function cardPlayed(interaction) {
	// interaction.message.delete();
	console.log(interaction);
	return;
	gameState.interaction.editReply({ content: `O player ${gameState.getPlayerName(gameState.currentPlayer)} jogou o ${gameState.tempCard.guild + gameState.tempCard.id}` });
	gameState.checkForRenuncia();
	gameState.nextMove();

	gameState.isRoundOver() ? roundEnded() : timeToPlay();
}

function roundEnded() {
	gameState.interaction.update({ content: `Ronda dja\'kaba. o vencedor foi a equipa ${gameState.checkForRoundWinner().at(-1)}` });
	gameState.isGameOver() ? gameEnded() : timeToPlay();
}


function gameEnded() {
	botVoiceGameEnd();
	gameState.interaction.update({ content: 'jogo feito nada mais. a calcular resultaddos' });
	gameState.calcTeamScores();

	gameState.gameScore.teamA === gameState.gameScore.teamB
		? gameDrawn()
		: gameWinner();
}

function botVoiceGameEnd() {
	//  toca uma musiquinha
}

function gameDrawn() {
	gameState.interaction.update(getEndGameForm);
}

function gameWinner() {
	gameState.interaction.update(getEndGameForm);
}

function getEndGameForm() {
	// action buttons
	const end = new ButtonBuilder().setCustomId(endGameActions.END).setLabel('Terminar o game').setStyle(ButtonStyle.Sucess);
	const more = new ButtonBuilder().setCustomId(endGameActions.MORE).setLabel('Nova partida').setStyle(ButtonStyle.Sucess);
	const reset = new ButtonBuilder().setCustomId(endGameActions.RESET).setLabel('Limpar resultados acomulados').setStyle(ButtonStyle.Secondary);

	const buttonsRow = new ActionRowBuilder().addComponents(end, more, reset);


	return {
		content: '**Temos vencedor. É a equipa X seus filhos da puta - Escolhe o queres fazer agora mother fuckers **',
		components: [buttonsRow],
	};
}


function endGameCloseAction(interaction) {
	interaction.delete();
	gameConfig = null;
	gameState = null;
}


function newGameRound(reset = false) {
	if (reset) { gameState.resetContinousScores(); }
	gameState.shuffleNewDeck();
	// todo - antes do timetoplay, temnos de settar o currentPlayer d e acordco com o vendcedor do jogo anterior
	timeToPlay(true);
}

