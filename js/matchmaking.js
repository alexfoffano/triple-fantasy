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
    async createRoom(initialGameState) {
        console.log("Matchmaking: Gerando Room ID...");
        this.roomId = this.generateRoomId();
        this.playerId = 'host'; // Restore accidentally deleted line
        this.roundId = Math.random().toString(36).substring(7); // ID da rodada atual local

        const roomRef = doc(db, "matches", this.roomId);

        // Estado inicial da partida
        const initialData = {
            createdAt: serverTimestamp(),
            status: 'waiting',
            roundId: this.roundId, // ID da rodada atual no servidor
            hostConnected: true,
            guestConnected: false,
            turn: initialGameState.turn, // 'host' ou 'guest'
            board: Array(9).fill(null),
            boardElements: initialGameState.boardElements,
            hostHand: initialGameState.hostHand,
            guestHand: initialGameState.guestHand,
            lastMove: null
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

        this.roundId = docSnap.data().roundId; // Sincroniza roundId

        // Atualiza status para playing
        await updateDoc(roomRef, {
            guestConnected: true,
            status: 'playing'
        });

        this.listenToRoom(this.roomId);
        return docSnap.data();
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

    // Solicita revanche
    async requestRematch() {
        if (!this.roomId) return;
        const roomRef = doc(db, "matches", this.roomId);
        const field = this.playerId === 'host' ? 'hostRematch' : 'guestRematch';

        await updateDoc(roomRef, {
            [field]: true
        });
    }

    // Finaliza a partida
    async endMatch() {
        if (!this.roomId) return;
        const roomRef = doc(db, "matches", this.roomId);

        // Apenas atualiza status se ainda estiver jogando
        // (Evita escritas desnecessárias se o outro já finalizou)
        // Mas como não temos transação aqui, pode ser race condition, mas ok para status.
        try {
            await updateDoc(roomRef, {
                status: 'finished'
            });
        } catch (e) {
            console.error("Erro ao finalizar partida no Firestore:", e);
        }
    }

    // Reinicia a partida (Apenas Host deve chamar isso com novo estado)
    async resetMatch(newGameState) {
        if (!this.roomId) return;
        const roomRef = doc(db, "matches", this.roomId);
        const newRoundId = Math.random().toString(36).substring(7);
        this.roundId = newRoundId; // Atualiza no Host imediatamente

        await updateDoc(roomRef, {
            status: 'playing',
            roundId: newRoundId, // Define nova rodada no servidor
            turn: newGameState.turn,
            board: Array(9).fill(null),
            boardElements: newGameState.boardElements,
            hostHand: newGameState.hostHand,
            guestHand: newGameState.guestHand,
            lastMove: null,
            hostRematch: false,
            guestRematch: false
        });
    }

    // Trata as atualizações recebidas
    handleRoomUpdate(data) {
        // 1. Verificar conexão do oponente
        if (this.playerId === 'host' && data.guestConnected && data.status === 'playing') {
            // Logic handled in game.js via hook
        }

        // 2. Verificar Remoção de Sala ou Reset
        // 2. Verificar Remoção de Sala ou Reset (via Round ID)
        if (data.status === 'playing' &&
            data.roundId && data.roundId !== this.roundId) {

            // Detectou que o servidor está numa rodada NOVA
            this.roundId = data.roundId; // Atualiza ID local
            this.game.onRematchStart(data); // Inicia nova partida
            return;
        }

        // 3. Verificar Pedido de Revanche do Oponente
        if (this.playerId === 'host' && data.hostRematch && data.guestRematch) {
            // Ambos aceitaram! Host gera novo estado e reinicia
            this.game.triggerRematchSetup();
        }

        // 4. Verificar jogada
        if (data.turn === this.playerId) {
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
