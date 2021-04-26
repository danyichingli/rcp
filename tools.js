const cloudinary = require('cloudinary').v2;
const { promisify } = require('util');
const fs = require('fs');
const parser = require('recipe-ingredient-parser-v2');
const convert = require('convert-units');
const _ = require('lodash');
const dbTools = require('./dbTools.js');

const Recipe = dbTools.Recipe;
const Meal = dbTools.Meal;
const User = dbTools.User;
const Account = dbTools.Account;

// const cloudinary_secrets = JSON.parse(fs.readFileSync('.secrets/cloudinary.json'));
// cloudinary.config({
//   cloud_name: cloudinary_secrets.CLOUD_NAME,
//   api_key: cloudinary_secrets.API_KEY,
//   api_secret: cloudinary_secrets.API_SECRET
// });
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});

const unlinkAsync = promisify(fs.unlink);

module.exports = {
  logged_in: function loggedIn(req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect('/');
    }
  },

  get_image_url: async function get_image_url(filename, path, recipeModel){
    try{
      // Upload to Cloudinary API
      cloudinary.uploader.upload(path, {
        public_id: filename,
        folder: 'recipe_calendar_planner',
        width: 1280,
        height: 720,
        crop: 'scale'
      }).then((result) =>
      recipeModel.findOne({imageId: filename}, function(err, foundRecipe) {
        foundRecipe.image = result.url;
        foundRecipe.imageId = result.public_id;
        foundRecipe.save()
      }));

      // Delete uploaded image from disk
      await unlinkAsync(path);

    } catch (err) {
      console.log(err);
    }
  },

  get_day_of_week: function get_day_of_week(date){
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return daysOfWeek[date.getDay()];
  },

  get_this_week: function get_this_week(today){
    var week = new Array(7);
    var weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    for (var i = 0; i < 7; i++){
      temp = new Date(weekStart)
      temp.setDate(weekStart.getDate() + i);
      week[i] = temp;
    }
    return week
  },

  get_last_sunday: function get_last_sunday(date){
    sunday = date;
    sunday.setDate(date.getDate() - date.getDay());
    return sunday;
  },

  get_all_recipes: async function get_all_recipes(foundMeals, accountId){
    // Only focus on the _id
    const foundRecipeIds = foundMeals.map(x => x.recipeId);
    // Find all recipes with corresponding _id
    return await Recipe.find({ 
      accountId: accountId,
      _id: {$in: foundRecipeIds} 
    }).exec().then(result => {
      return result
    });
  },

  // Gets 'today' based on user's selected timezone
  get_today_local: function get_today_local(date, timezone){
    if(timezone.length === 0){
      return date;
    }
    const localDate = date.toLocaleString('en-US', { timeZone: timezone }).split(', ')[0];
    return new Date(localDate);
  },

  get_all_meals: async function get_all_recipes(today){
    tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return await Meal.find({ 
      date: { $gte: today.toISOString(), $lt: tomorrow.toISOString() },
    });
  },

  get_user_cookie: function get_user_cookie(req) {
    return User.findOne({sid: req.cookies['connect.sid']})
    .then(foundUser => {
      if (!foundUser){
        newUser = new User({
          accountId: '',
          sid: req.cookies['connect.sid'],
          userTimezone: 'Etc/Greenwich'
        });
        newUser.save();
        return newUser;
      }
      return foundUser
    });
  },

  compose_recipe_plan: function compose_recipe_plan(req, date, accountId) {
    
    // Default 'not found' image
    const placeholder_img = 'https://www.thermaxglobal.com/wp-content/uploads/2020/05/image-not-found.jpg';

    // New Recipe Item
    recipe = new Recipe({
      accountId: accountId,
      title: req.body.recipeTitle,
      description: req.body.recipeDescription,
      image: placeholder_img,
      imageId: "",
      ingredients: req.body.recipeIngredients,
      instructions: req.body.recipeInstructions,
      url: req.body.recipeURL,
    });
    recipe.save();

    // Check for image input
    if (req.file) {
      recipe.imageId = req.file.filename
      this.get_image_url(recipe.imageId, req.file.path, Recipe)
    }

    // New Meal Item
    if (date){
      this.compose_meal_plan(date, recipe._id, );
    }
  },

  compose_meal_plan: function compose_meal_plan(date, recipeId){
    var today = new Date(date);
    var tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check if meal exists
    Meal.findOne({
      recipeId: recipeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }, function(err, foundMeal){
      if(!foundMeal){
        // Create new meal plan
        meal = new Meal({
          date: date,
          recipeId: recipeId
        });
        meal.save();
      } else {
        // Or pass if one was already made for this date
        console.log("Meal plan was already made!");
      }
    });
  },

  delete_recipe: function delete_recipe(recipeId, imageId){
    // Delete recipe image asset from Cloudinary
    this.delete_image(imageId);

    // Delete all meals associated with recipe
    Meal.deleteMany({recipeId: recipeId}, function(err){
      if (!err){
        console.log("Successfully deleted meals.");
      }
    });

    // Delete recipe
    Recipe.deleteOne({_id: recipeId}, function(err){
      if (!err){
        console.log("Successfully deleted recipe.");
      }
    });
  },

  delete_meal: function delete_meal(recipeId, date){
    var today = new Date(date);
    var tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    Meal.deleteOne({
      recipeId: recipeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }, function(err){
      if (!err){
        console.log("Successfully deleted meal.");
      }
    });

  },

  delete_image: function deleteImage(imageId){
    cloudinary.uploader.destroy(imageId, function(err){
      if (!err){
        console.log("Successfully removed image from Cloudinary API.");
      }
    });
  },

  delete_account: async function deleteAccount(accountId){
    delete_recipe = this.delete_recipe;
    delete_image = this.delete_image;
    
    // Delete recipes and meals associated with account
    await Recipe.find({accountId: accountId}, function(err, recipes){
      recipes.forEach(function(recipe){
        this.delete_recipe(recipe._id, recipe.imageId);
      });
      console.log("Successfully deleted recipes");
    });

    // Delete account
    await Account.deleteOne({_id: accountId}, function(err){
      if (!err) {
        console.log("Successfully deleted account.");
      } else {
        console.log(err);
      }
    });
  },

  edit_recipe: async function edit_recipe(req){
    const recipeId = req.body.recipeId;
    // Update Recipe Item
    Recipe.findByIdAndUpdate(recipeId,{
      title: req.body.recipeTitle,
      description: req.body.recipeDescription,
      ingredients: req.body.recipeIngredients,
      instructions: req.body.recipeInstructions,
      url: req.body.recipeURL,
    }, {new: true}, function(err){
      if (!err){
        console.log("Successfully updated!");
      }
    });

    // Check for image input
    if (req.file) {
      const oldImageId = req.body.imageId;
      function update_image(get_image_url, delete_image){
        Recipe.findByIdAndUpdate(recipeId,{
          imageId: req.file.filename
        }, {new: true}, function(err, foundRecipe){
          // Update recipe with new image
          get_image_url(foundRecipe.imageId, req.file.path, Recipe);
          // Delete old recipe image asset from Cloudinary
          delete_image(oldImageId);
        });
      }
      update_image(this.get_image_url, this.delete_image);
    }
  },

  generate_shopping_list: function generate_shopping_list(ingredientsList){
    var parsedIngredientList = [];
    ingredientsList.forEach(function(item){
      parsedIngredientList.push(parser.parse(item));
    });

    var result = [];
    parsedIngredientList.forEach(function(item){
      if (!this[item.ingredient]){
        this[item.ingredient] = {
          quantity: '',
          unit: item.unit,
          ingredient: item.ingredient,
          minQty: 0,
          maxQty: 0
        };
        result.push(this[item.ingredient]);
      }

      if(this[item.ingredient].unit != item.unit){
        // Find the abbreviation of the units to use for convert package
        let unit1 = convert().list().find(unit => unit.singular === _.startCase(item.unit)).abbr;
        let unit2 = convert().list().find(unit => unit.singular === _.startCase(this[item.ingredient].unit)).abbr;
        // Currently all units are coverted to first seen unit of that ingredient
        item.minQty = convert(item.minQty).from(unit1).to(unit2);
        item.maxQty = convert(item.maxQty).from(unit1).to(unit2);
      }

      //  the minQty and
      this[item.ingredient].minQty += Number(item.minQty);
      this[item.ingredient].minQty = _.round(this[item.ingredient].minQty, 2);
      this[item.ingredient].maxQty += Number(item.maxQty);
      this[item.ingredient].maxQty = _.round(this[item.ingredient].maxQty, 2);

      if(this[item.ingredient].minQty === this[item.ingredient].maxQty){
        this[item.ingredient].quantity = String(this[item.ingredient].minQty);
      } else {
        this[item.ingredient].quantity = String(this[item.ingredient].minQty) + '-' + String(this[item.ingredient].maxQty);
      }
    }, Object.create(null));
    return result;
  },
}
