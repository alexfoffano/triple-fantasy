import { db } from "./firebase-config.js";
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    updateDoc,
    serverTimestamp,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class Matchmaking {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.roomId = null;
        this.playerId = null; // 'host' or 'guest'
        this.unsubscribe = null;
    }

    // Gera um ID aleatório para a sala
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Cria uma nova sala
    async createRoom() {
        console.log("Matchmaking: Gerando Room ID...");
        this.roomId = this.generateRoomId();
        this.playerId = 'host';

        const roomRef = doc(db, "matches", this.roomId);

        // Estado inicial da partida
        const initialData = {
            createdAt: serverTimestamp(),
            status: 'waiting', // waiting, playing, finished
            hostConnected: true,
            guestConnected: false,
            turn: 'host', // host começa (Blue/You)
            board: Array(9).fill(null), // Tabuleiro vazio
            lastMove: null // Última jogada para animação
        };

        console.log("Matchmaking: Salvando sala no Firestore...", this.roomId);
        try {
            await setDoc(roomRef, initialData);
            console.log("Matchmaking: Sala criada com sucesso!");
            this.listenToRoom(this.roomId);
            return this.roomId;
        } catch (e) {
            console.error("Matchmaking: Erro ao criar sala:", e);
            throw e;
        }
    }

    // Entra em uma sala existente
    async joinRoom(roomId) {
        this.roomId = roomId;
        this.playerId = 'guest';

        const roomRef = doc(db, "matches", this.roomId);
        const docSnap = await getDoc(roomRef);

        if (!docSnap.exists()) {
            throw new Error("Sala não encontrada!");
        }

        if (docSnap.data().status !== 'waiting' && docSnap.data().status !== 'playing') {
            throw new Error("Esta sala já foi fechada ou a partida acabou.");
        }

        // Atualiza status para playing
        await updateDoc(roomRef, {
            guestConnected: true,
            status: 'playing'
        });

        this.listenToRoom(this.roomId);
        return true;
    }

    // Escuta atualizações da sala em tempo real
    listenToRoom(roomId) {
        if (this.unsubscribe) this.unsubscribe();

        const roomRef = doc(db, "matches", roomId);

        this.unsubscribe = onSnapshot(roomRef, (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            this.handleRoomUpdate(data);
        });
    }

    // Trata as atualizações recebidas
    handleRoomUpdate(data) {
        // 1. Verificar conexão do oponente
        if (this.playerId === 'host' && data.guestConnected && data.status === 'playing') {
            // Oponente conectou! Notificar UI/Jogo
            // TODO: Disparar evento de "Oponente Encontrado"
            console.log("Oponente conectado!");
        }

        // 2. Verificar se houve jogada do oponente
        // Se for minha vez, significa que o oponente jogou e passou a vez pra mim
        if (data.turn === this.playerId) {
            // Verificar se o tabuleiro local está diferente do remoto
            // (Simplificação: apenas pegar a última jogada se houver)
            if (data.lastMove && data.lastMove.player !== this.playerId) {
                this.game.remotePlaceCard(data.lastMove);
            }
        }
    }

    // Envia uma jogada para o Firestore
    async sendMove(cardIndex, boardIndex, cardData) {
        if (!this.roomId) return;

        const roomRef = doc(db, "matches", this.roomId);

        // Próximo turno será do outro jogador
        const nextTurn = this.playerId === 'host' ? 'guest' : 'host';

        await updateDoc(roomRef, {
            turn: nextTurn,
            lastMove: {
                player: this.playerId,
                cardIndex: cardIndex,
                boardIndex: boardIndex,
                card: cardData
            },
            // board: ... (poderíamos salvar o tabuleiro todo, mas por enquanto vamos confiar na sincronia dos movimentos)
        });
    }
}
