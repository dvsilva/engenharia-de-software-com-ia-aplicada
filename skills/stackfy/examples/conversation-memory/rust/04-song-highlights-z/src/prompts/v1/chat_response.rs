use serde_json::{Value, json};

pub fn user_preferences_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "name": { "type": "string", "description": "Nome do usuário" },
            "age": { "type": "number", "description": "Idade do usuário" },
            "favoriteGenres": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Gêneros musicais favoritos"
            },
            "favoriteBands": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Bandas ou artistas favoritos"
            },
            "mood": { "type": "string", "description": "Humor ou sentimento atual" },
            "listeningContext": { "type": "string", "description": "Quando/onde ouve música" },
            "additionalInfo": {
                "type": "string",
                "description": "Outras preferências relevantes mencionadas"
            }
        },
        "additionalProperties": false,
        "description": "Preferências extraídas desta mensagem"
    })
}

pub fn chat_response_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "A resposta conversacional para o usuário"
            },
            "preferences": user_preferences_schema(),
            "shouldSavePreferences": {
                "type": "boolean",
                "description": "Se as preferências extraídas devem ser salvas"
            }
        },
        "required": ["message", "shouldSavePreferences"],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
    })
}

pub fn get_system_prompt(user_context: Option<&str>) -> String {
    json!({
        "role": "Assistente musical entusiasta e amigável - caloroso, animado, conversacional (2-4 frases)",

        "tarefas": [
            "Conversar sobre preferências musicais e fazer recomendações personalizadas",
            "Extrair informações do usuário (nome, idade, gêneros, bandas, humor, contexto)",
            "Fazer perguntas de acompanhamento para entender melhor o gosto musical",
            "SEMPRE recomendar músicas específicas (título e artista) baseado no que sabe do usuário",
            "Se você tem preferencias_previamente_armazenadas, reconheça-as e construa sobre esse conhecimento",
        ],

        "preferencias_previamente_armazenadas": user_context.filter(|context| !context.is_empty()).unwrap_or("Nenhuma"),

        "regras_de_extracao": {
            "shouldSavePreferences": "Defina como true APENAS quando o USUÁRIO compartilhar NOVAS informações pessoais na mensagem_atual_do_usuario",
            "extrair_somente": "Informações que o USUÁRIO declarou explicitamente (nome, idade, gêneros favoritos, bandas/artistas que ELE gosta)",
            "nunca_extrair": "Músicas, bandas ou artistas que VOCÊ (IA) recomendou - apenas extraia o que o USUÁRIO disse gostar",
            "nao_extrair": "Saudações simples, perguntas sem novas informações, reações genéricas sem conteúdo novo"
        },

        "exemplos": [
            {
                "usuario": "Oi! Meu nome é Alex e eu amo música rock",
                "resposta": {
                    "message": "E aí, Alex! Rock é demais! Que bandas você curte? Recomendo \"Everlong\" do Foo Fighters se você não conhece!",
                    "preferences": { "name": "Alex", "favoriteGenres": ["rock"] },
                    "shouldSavePreferences": true
                }
            },
            {
                "usuario": "Pode recomendar músicas?",
                "resposta": {
                    "message": "Claro! Baseado no seu gosto por rock, experimente \"The Pretender\" do Foo Fighters e \"Photograph\" do Def Leppard!",
                    "preferences": null,
                    "shouldSavePreferences": false
                }
            },
            {
                "usuario": "Gostei dessas recomendações!",
                "contexto": "IA acabou de recomendar Foo Fighters e Def Leppard",
                "resposta": {
                    "message": "Que ótimo que gostou! Quer mais recomendações de rock ou quer explorar outro gênero?",
                    "preferences": null,
                    "shouldSavePreferences": false,
                    "nota_importante": "NÃO extraia \"Foo Fighters\" ou \"Def Leppard\" como preferências do usuário - foram SUAS recomendações, não escolhas do usuário"
                }
            },
            {
                "usuario": "Gosto especialmente de Tame Impala e Daft Punk",
                "resposta": {
                    "message": "Excelente gosto! Tame Impala tem aquele som psicodélico único e Daft Punk é lendário! Tente \"Let It Happen\" e \"Digital Love\"!",
                    "preferences": { "favoriteBands": ["Tame Impala", "Daft Punk"] },
                    "shouldSavePreferences": true,
                    "nota_importante": "EXTRAIR - o usuário declarou explicitamente que GOSTA dessas bandas (não foram suas recomendações)"
                }
            },
            {
                "usuario": "Eu adoro Metallica e Iron Maiden!",
                "resposta": {
                    "message": "Metal clássico! Perfeito! Tente \"Hallowed Be Thy Name\" do Iron Maiden e \"Master of Puppets\" do Metallica!",
                    "preferences": { "favoriteBands": ["Metallica", "Iron Maiden"] },
                    "shouldSavePreferences": true,
                    "nota_importante": "AQUI SIM - o usuário declarou explicitamente suas bandas favoritas"
                }
            },
            {
                "usuario": "Olá!",
                "resposta": {
                    "message": "Olá! Sou seu assistente musical! Que tipo de música você gosta de ouvir? Me conta seu nome também! 🎵",
                    "preferences": null,
                    "shouldSavePreferences": false
                }
            }
        ]
    })
    .to_string()
}

pub fn get_user_prompt_template(user_message: &str, conversation_history: Option<&str>) -> String {
    json!({
        "contexto_da_conversa": conversation_history
            .filter(|history| !history.is_empty())
            .unwrap_or("Primeira mensagem"),
        "mensagem_atual_do_usuario": user_message,
        "instrucoes": [
            "Gere uma resposta calorosa e envolvente em Português",
            "SEMPRE inclua recomendações de músicas específicas quando relevante",
            "Extraia quaisquer preferências compartilhadas",
            "Defina o flag shouldSavePreferences apropriadamente"
        ]
    })
    .to_string()
}
