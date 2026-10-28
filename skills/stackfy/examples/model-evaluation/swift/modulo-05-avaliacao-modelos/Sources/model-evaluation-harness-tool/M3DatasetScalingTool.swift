enum FieldValue: Equatable {
  case text(String)
  case number(Double)
}

struct Example {
  let instruction: String
  let input: String
  let expected: [(field: String, value: FieldValue)]
  let caseName: String
  let source: String
  let id: String
}

enum DatasetScaling {
  static let names = [
    "Marcos Vinicius Andrade Pereira", "Fernanda Costa Ribeiro", "Joaquim Pedro Salgado",
    "Beatriz Nogueira Lima", "Rafael Augusto Teixeira", "Camila dos Santos Farias",
    "Eduardo Henrique Barros", "Larissa Martins Cardoso", "Thiago Moreira Duarte",
    "Patricia Alves Monteiro", "Bruno Cesar Figueiredo", "Juliana Rocha Pimentel",
    "Gustavo Henrique Vasconcelos", "Renata Souza Albuquerque", "Diego Fernandes Castro",
    "Mariana Lopes Guimaraes", "Vinicius Almeida Correia", "Sabrina Ferreira Nunes",
    "Leonardo Batista Cavalcanti", "Priscila Andrade Melo", "Rodrigo Tavares Siqueira",
    "Amanda Cristina Peixoto", "Felipe Augusto Barbosa", "Carolina Machado Freitas",
    "Anderson Luiz Ramalho", "Vanessa Regina Coutinho", "Fabio Junior Aragao",
    "Debora Cristina Vieira", "Marcelo Souza Bittencourt", "Tatiane Pereira Godoy",
    "Alexandre Costa Miranda", "Cristiane Lopes Assuncao", "Fernando Braga Quintanilha",
    "Simone Rocha Vilaca", "Rogerio dos Santos Pena", "Michele Aparecida Fonseca",
    "Wagner Luiz Bessa", "Andreia Cristina Prado", "Cesar Augusto Nascimento",
    "Roberta Lima Sarmento", "Paulo Ricardo Andrade",
  ]

  static let plates = [
    "QJK-4F82", "RTL-9921", "MNB-3310", "PLW-7765", "ZXC-2298", "BVN-6641",
    "TYU-1183", "GHJ-5529", "FDS-8842", "LKM-3376", "OIU-9954", "CVB-1120",
    "ASD-6673", "WER-4481", "XSW-2290", "POI-7738", "HGF-3391", "MJU-6624",
    "NBV-1187", "KLO-5540", "ERT-8873", "YUI-2216", "CDE-9950", "VBN-4483",
    "AZS-6617", "QWE-1150", "DFG-7784", "RTY-3318", "FGH-8852", "TGB-2286",
    "YHN-5520", "UJM-9954", "IKM-4488", "OLP-1122", "WSX-6656", "EDC-1190",
    "RFV-5524", "TGB-9958", "YHN-3392", "UJM-7726", "ZAQ-1128", "XSW-6652", "CDE-3396",
  ]

  static let procedures = [
    "consulta cardiologica", "exame de sangue completo", "fisioterapia ortopedica",
    "consulta ortopedica", "exame de imagem (ressonancia)", "consulta psiquiatrica",
    "sessao de fonoaudiologia", "exame oftalmologico", "consulta dermatologica",
    "exame de densitometria ossea", "consulta nutricional", "sessao de acupuntura",
    "consulta ginecologica", "exame de urina completo", "sessao de terapia ocupacional",
    "consulta endocrinologica", "exame de eletrocardiograma", "consulta neurologica",
    "sessao de pilates terapeutico", "exame de audiometria", "consulta pediatrica",
    "exame de mamografia", "sessao de psicoterapia", "consulta geriatrica",
    "consulta de clinica geral", "exame de colonoscopia", "sessao de fonoterapia",
    "consulta urologica", "exame de tomografia",
  ]

  static let amounts = [
    "3.210,50", "1.870,00", "5.640,00", "2.430,75", "890,00", "4.120,30",
    "1.250,00", "3.980,60", "2.760,00", "6.310,90", "1.540,00", "2.990,25",
    "3.450,00", "1.780,50", "4.560,00", "2.220,80", "5.120,00", "1.630,40",
    "3.870,00", "2.045,90", "4.780,60", "1.395,00", "6.020,50", "2.510,30",
    "3.660,00", "1.925,80", "4.310,00", "2.870,60", "5.480,00", "1.485,70",
    "3.120,00", "2.640,90", "4.950,00", "1.780,00", "3.390,60", "2.210,00",
    "5.870,00", "1.660,40", "4.120,00", "2.980,50", "3.780,90", "2.340,00", "4.910,60",
    "1.590,00", "3.260,40", "2.150,80", "4.430,00",
  ]

  static let dates = [
    "12/03/2026", "02/04/2026", "18/05/2026", "25/03/2026", "09/04/2026", "30/04/2026",
    "14/03/2026", "21/05/2026", "05/04/2026", "11/05/2026", "28/03/2026", "16/04/2026",
    "03/06/2026", "19/06/2026", "07/06/2026", "24/06/2026", "01/07/2026", "15/07/2026",
    "22/07/2026", "29/07/2026", "06/02/2026", "13/02/2026", "20/02/2026", "27/02/2026",
    "04/02/2026", "10/06/2026", "17/03/2026", "26/04/2026", "02/05/2026", "08/06/2026",
    "23/06/2026",
  ]

  static let autoSources = [
    "Oficina Estrela", "Auto Center Silva", "Funilaria Rio Bonito",
    "Oficina Nova Aliança", "Mecânica Horizonte", "Auto Reparos União",
  ]

  static let healthSources = [
    "Clínica Vitalis", "Hospital Santa Clara", "Centro Médico Bem Estar",
    "Clínica São Rafael", "Instituto Saúde Plena",
  ]

  static let firstNames = names.map { String($0.split(separator: " ")[0]) }
  static let surnames = names.prefix(37).map { $0.split(separator: " ").dropFirst().joined(separator: " ") }

  static func workshopEstimate(source: String, name: String, plate: String, date: String, amount: String) -> String {
    switch source {
    case "Oficina Estrela":
      return "ATIVA ORCAMENTOS AUTOMOTIVOS OFICINA ESTRELA LTDA CNPJ 12.345.678/0001-90 Rua das Turbinas 450 Distrito Industrial "
        + "Segurado: \(name) Placa do veiculo: \(plate) Data do sinistro: \(date) "
        + "Descricao do servico: reparo de lataria e pintura no para-choque dianteiro Valor total do reparo: R$ \(amount)"
    case "Auto Center Silva":
      return "AUTO CENTER SILVA - FUNILARIA E PINTURA - CNPJ 98.765.432/0001-11 Av. dos Mecanicos 220 "
        + "Cliente/Segurado: \(name) Placa: \(plate) Data do atendimento: \(date) "
        + "Servico executado: troca de para-lama e revisao de suspensao dianteira Valor: R$ \(amount)"
    case "Funilaria Rio Bonito":
      return "FUNILARIA RIO BONITO ME CNPJ 45.111.222/0001-33 Rua Rio Bonito 88 "
        + "Nome do segurado: \(name) Placa do veiculo: \(plate) Data: \(date) "
        + "Orcamento: substituicao de parachoque traseiro e polimento Valor total: R$ \(amount)"
    case "Oficina Nova Aliança":
      return "OFICINA NOVA ALIANCA LTDA CNPJ 22.333.444/0001-55 Estrada Velha 1200 "
        + "Segurado: \(name) Placa do carro: \(plate) Data do orcamento: \(date) "
        + "Descricao: reparo de amassado na porta dianteira Valor cobrado: R$ \(amount)"
    case "Mecânica Horizonte":
      return "MECANICA HORIZONTE LTDA CNPJ 51.222.888/0001-19 Av. do Horizonte 640 "
        + "Segurado: \(name) Placa do veiculo: \(plate) Data do servico: \(date) "
        + "Descricao: alinhamento e balanceamento apos colisao lateral Valor total: R$ \(amount)"
    default:
      return "AUTO REPAROS UNIAO ME CNPJ 63.444.777/0001-28 Rua da Uniao 305 "
        + "Nome do segurado: \(name) Placa: \(plate) Data do atendimento: \(date) "
        + "Servico: troca de para-brisa trincado Valor cobrado: R$ \(amount)"
    }
  }

  static func medicalReceipt(source: String, name: String, procedure: String, date: String, amount: String) -> String {
    switch source {
    case "Clínica Vitalis":
      return "CLINICA VITALIS SAUDE OCUPACIONAL CNPJ 33.222.111/0001-44 Av. Paulista 900 "
        + "Paciente/Beneficiario: \(name) Procedimento: \(procedure) Data do atendimento: \(date) "
        + "Valor cobrado: R$ \(amount)"
    case "Hospital Santa Clara":
      return "HOSPITAL SANTA CLARA CNPJ 66.555.444/0001-22 Rua das Acacias 310 "
        + "Beneficiario: \(name) Procedimento realizado: \(procedure) Data: \(date) "
        + "Valor total: R$ \(amount)"
    case "Centro Médico Bem Estar":
      return "CENTRO MEDICO BEM ESTAR CNPJ 77.888.999/0001-66 Rua da Saude 45 "
        + "Nome do beneficiario: \(name) Procedimento: \(procedure) Data da consulta: \(date) "
        + "Valor cobrado: R$ \(amount)"
    case "Clínica São Rafael":
      return "CLINICA SAO RAFAEL CNPJ 84.111.222/0001-37 Rua Sao Rafael 512 "
        + "Paciente/Beneficiario: \(name) Procedimento: \(procedure) Data do atendimento: \(date) "
        + "Valor total: R$ \(amount)"
    default:
      return "INSTITUTO SAUDE PLENA LTDA CNPJ 91.333.555/0001-08 Av. da Saude Plena 78 "
        + "Beneficiario: \(name) Procedimento realizado: \(procedure) Data: \(date) "
        + "Valor cobrado: R$ \(amount)"
    }
  }

  static func number(fromAmount amount: String) -> Double {
    Double(amount.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")) ?? 0
  }

  static func example(caseName: String, source: String, index: Int) -> Example {
    let name = "\(firstNames[index % firstNames.count]) \(surnames[(index * 7 + 3) % surnames.count])"
    let date = dates[(index * 7 + 3) % dates.count]
    let amount = amounts[(index * 11 + 5) % amounts.count]
    let id = "\(caseName)-\(source)-\(index)"

    if caseName == "amplitude-auto" {
      let plate = plates[(index * 13 + 2) % plates.count]

      return Example(
        instruction: "Extraia segurado, placa e valor do orçamento de oficina abaixo.",
        input: workshopEstimate(source: source, name: name, plate: plate, date: date, amount: amount),
        expected: [("segurado", .text(name)), ("placa", .text(plate)), ("valor", .number(number(fromAmount: amount)))],
        caseName: caseName,
        source: source,
        id: id
      )
    }

    let procedure = procedures[(index * 5 + 1) % procedures.count]

    return Example(
      instruction: "Extraia beneficiário, procedimento e valor do recibo médico abaixo.",
      input: medicalReceipt(source: source, name: name, procedure: procedure, date: date, amount: amount),
      expected: [("beneficiario", .text(name)), ("procedimento", .text(procedure)), ("valor", .number(number(fromAmount: amount)))],
      caseName: caseName,
      source: source,
      id: id
    )
  }
}
