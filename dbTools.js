const mongoose = require('mongoose');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
// const { MongoMemoryServer } = require('mongodb-memory-server');

// const mongod = new MongoMemoryServer();

class DB {
  constructor(dbName, dbURL) {
    this.dbName = dbName;
    this.dbURL = dbURL;
  }
}

// Recipe
const recipesSchema = {
  accountId: String,
  title: String,
  description: String,
  image: String,
  imageId: String,
  ingredients: String, // ingredient _id
  instructions: String,
  url: String,
};
const Recipe = mongoose.model('Recipe', recipesSchema);

// Meal
const mealsSchema = {
  date: Date,
  recipeId: String // recipe._id
}
const Meal = mongoose.model('Meal', mealsSchema);

// User
const usersSchema = {
  accountId: String,
  sid: String,
  userTimezone: String,
}
const User = mongoose.model('User', usersSchema);

// Account
const accountsSchema = new mongoose.Schema ({
  username: String,
  password: String,
});
accountsSchema.plugin(passportLocalMongoose);

const Account = new mongoose.model("Account", accountsSchema);

passport.use(Account.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

module.exports = {
  Recipe: Recipe,
  Meal: Meal,
  User: User,
  Account: Account,
  mongoose: mongoose,
  database: {
    connect: async () => {
      const productionDB = new DB('Production (!!!)', 'mongodb+srv://admin-daniel:' + process.env.DB_PASSWORD + '@rcpcluster.umaaj.mongodb.net/rcpDB?retryWrites=true&w=majority');
      const developerDB = new DB('Developer', 'mongodb://localhost:27017/rcpDB');
      // const testDB = new DB('Test', await mongod.getUri());

      const currentDB = productionDB;

      await mongoose
        .connect(currentDB.dbURL, {
          useNewUrlParser: true,
          useCreateIndex: true,
          useUnifiedTopology: true,
          useFindAndModify: false,
        })
        .then(() => console.log(currentDB.dbName + ' database connected'))
        .catch(err => console.log(currentDB.dbName + ' database not connected', err));
      },
    closeDatabase: async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      await mongod.stop();
    },
    clearDatabase: async () => {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
          const collection = collections[key];
          await collection.deleteMany();
      }
    }
  }
};
