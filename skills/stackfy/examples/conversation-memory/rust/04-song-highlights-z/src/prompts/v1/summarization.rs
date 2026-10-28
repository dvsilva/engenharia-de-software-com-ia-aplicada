use serde_json::{Value, json};

pub fn summary_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "name": { "type": "string", "description": "Nome do usuário" },
            "age": { "type": "number", "description": "Idade do usuário" },
            "favoriteGenres": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Gêneros musicais favoritos mencionados"
            },
            "favoriteBands": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Bandas ou artistas favoritos mencionados"
            },
            "keyPreferences": {
                "type": "string",
                "description": "Sumário conciso das preferências musicais, padrões de humor e hábitos"
            },
            "importantContext": {
                "type": "string",
                "description": "Qualquer outro contexto importante sobre o usuário"
            }
        },
        "required": ["keyPreferences"],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
    })
}

pub fn get_summarization_system_prompt() -> String {
    json!({
        "role": "Sumarizador de conversação para preferências musicais",

        "tarefa": "Analisar conversa e extrair preferências musicais estruturadas",

        "campos_para_extrair": {
            "name": "Nome do usuário",
            "age": "Idade do usuário",
            "favoriteGenres": "Todos os gêneros mencionados",
            "favoriteBands": "Todas as bandas/artistas mencionados",
            "keyPreferences": "Sumário de 2-4 frases sobre gostos, padrões de humor e contexto de escuta",
            "importantContext": "Outros detalhes relevantes"
        },

        "regras": [
            "Combinar informações duplicadas",
            "Ser específico sobre gêneros e artistas",
            "Incluir associações de humor (ex: \"gosta de rock animado ao fazer exercícios\")",
            "Se atualizando sumário anterior, preservar info não discutida na nova conversa",
            "Incluir apenas informações explicitamente declaradas"
        ]
    })
    .to_string()
}

pub fn get_summarization_user_prompt(
    conversation_history: &[(&str, &str)],
    previous_summary: Option<&Value>,
) -> String {
    let conversation = conversation_history
        .iter()
        .map(|(role, content)| format!("{role}: {content}"))
        .collect::<Vec<_>>()
        .join("\n");

    json!({
        "conversa": conversation,
        "sumario_anterior": previous_summary.cloned().unwrap_or_else(|| "Nenhum".into()),
        "instrucoes": [
            "Atualizar sumário com novas informações desta conversa",
            "Preservar info existente não discutida nas novas mensagens"
        ]
    })
    .to_string()
}
