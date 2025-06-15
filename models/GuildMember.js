module.exports = (sequelize, DataTypes) => {
    const GuildMember = sequelize.define('GuildMember', {
        Id: { // Corresponde ao 'Id' da API
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true,
            unique: true,
        },
        Name: { // Corresponde ao 'Name' da API
            type: DataTypes.STRING,
            allowNull: false,
        },
        // Você pode adicionar outros campos da API aqui se precisar, por exemplo:
        // GuildId: DataTypes.STRING,
        // AllianceId: DataTypes.STRING,
        // KillFame: DataTypes.INTEGER,
        // DeathFame: DataTypes.INTEGER,
    });

    // GuildMember.associate = (models) => {
    //   // Defina associações aqui se necessário
    //   // Ex: GuildMember.belongsTo(models.Guild);
    // };

    return GuildMember;
};