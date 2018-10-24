'use strict';

module.exports = (sequelize, DataTypes) => {
  var CachedMessage = sequelize.define('cached_message', {
    room_id: DataTypes.INTEGER,
    type: DataTypes.STRING,
    data: DataTypes.TEXT('long'),
    time: DataTypes.DATE
  }, {
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  })
  CachedMessage.associate = function(models) {
    // associations can be defined here
  }
  return CachedMessage
};