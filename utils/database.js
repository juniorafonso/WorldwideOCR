const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Caminho para a raiz do projeto (assumindo que utils/database.js está um nível abaixo da raiz)
const projectRoot = path.join(__dirname, '..');

// Garante que a pasta 'data' exista na raiz do projeto
const dataDir = path.join(projectRoot, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Configuração do Sequelize para SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dataDir, 'database.sqlite'), // Caminho para o arquivo do banco de dados em data/
    logging: false, // Defina como console.log para ver as queries SQL
});

const db = {};

// Carregar todos os modelos da pasta 'models' na raiz do projeto
const modelsDir = path.join(projectRoot, 'models');
if (fs.existsSync(modelsDir)) {
    fs.readdirSync(modelsDir)
        .filter(file => file.indexOf('.') !== 0 && file.slice(-3) === '.js' && file !== 'index.js')
        .forEach(file => {
            const modelDefinition = require(path.join(modelsDir, file));
            const model = modelDefinition(sequelize, DataTypes);
            db[model.name] = model;
            console.log(`[DB] Modelo ${model.name} carregado.`);
        });
} else {
    console.warn("[DB] Pasta 'models' não encontrada na raiz do projeto. Nenhum modelo carregado.");
}


// Configurar associações (se houver)
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
        console.log(`[DB] Associações para ${modelName} configuradas.`);
    }
});

db.sequelize = sequelize; // Instância do Sequelize
db.Sequelize = Sequelize; // Classe Sequelize

module.exports = db;