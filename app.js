//jshint esversion:6
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const multer = require('multer');
const tools = require('./tools.js');
const dbTools = require('./dbTools.js');
const mongoose = dbTools.mongoose;
const fs = require('fs');
const cookieParser = require('cookie-parser');

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static('public'));
app.use(cookieParser());

const Recipe = dbTools.Recipe;
const Meal = dbTools.Meal;
const User = dbTools.User;

dbTools.database.connect()

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads')
  },
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
});

var upload = multer({
  storage: storage
});

// GET
app.get('/', async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const today = tools.get_today_local(new Date(), cookie.userTimezone);
  const foundRecipes = await tools.get_all_meals(today)
    .then(foundMeals => tools.get_all_recipes(foundMeals)
    .then(foundRecipes => {return foundRecipes}));
  Recipe.find({}, function(err, recipeRecords){
    res.render('day_plan', {
      todayDate: today,
      todayRecipes: foundRecipes,
      recipeItems: recipeRecords,
      tools: tools,
      redirectPath: '/'
    });
  });
});


app.get('/week_plan', async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const today = tools.get_today_local(new Date(), cookie.userTimezone);
  const week = tools.get_this_week(today);
  var weekdayPlans = {};
  for(var i = 0; i < 7; i++){
    weekday = new Date(week[i]);
    const foundRecipes = await tools.get_all_meals(weekday)
      .then(foundMeals => tools.get_all_recipes(foundMeals)
      .then(foundRecipes => {return foundRecipes}));
    weekdayPlans[i] = foundRecipes;
  }
  Recipe.find({}, function(err, recipeRecords){
    res.render('week_plan', {
      todayDate: today,
      thisWeek: week,
      thisWeekRecipes: weekdayPlans,
      recipeItems: recipeRecords,
      tools: tools,
      redirectPath: '/week_plan'
    });
  });
});

app.get('/recipe_list', function(req, res) {
  Recipe.find({}, function(err, recipeRecords) {
    res.render('recipe_list', {
      recipeItems: recipeRecords
    });
  });
});

app.get('/recipe_list/:recipeId', function(req, res) {
  const recipeId = req.params.recipeId;
  Recipe.findOne({
    _id: recipeId
  }, function(err, foundRecipe) {
    res.render('recipe', {
      recipe: foundRecipe
    });
  });
});

app.get('/preferences', async function(req, res) {
  const sid = req.cookies['connect.sid'];
  const defaultTimezone = 'Etc/Greenwich';

  await User.findOne({sid: sid}, function(err, result){
    if(!result){
      user = new User({
        sid: sid,
        userTimezone: defaultTimezone
      });
      user.save();
      res.render('preferences', {
        currentTimezone: user.userTimezone
      });
    } else {
      res.render('preferences', {
        currentTimezone: result.userTimezone
      });
    }
  });
});

app.get('/day_plan/:yyyymmdd', async function(req, res) {
  const yyyy = (req.params.yyyymmdd).slice(0, 4) + '/';
  const mm = (req.params.yyyymmdd).slice(4, 6) + '/';
  const dd = (req.params.yyyymmdd).slice(6, 8);
  const today = new Date(yyyy+mm+dd);
  const foundRecipes = await tools.get_all_meals(today)
    .then(foundMeals => tools.get_all_recipes(foundMeals)
    .then(foundRecipes => {return foundRecipes}));

  Recipe.find({}, function(err, recipeRecords){
    res.render('day_plan', {
      todayDate: today,
      todayRecipes: foundRecipes,
      recipeItems: recipeRecords,
      tools: tools,
      redirectPath: '/' + req.params.yyyymmdd
    });
  });
});

app.get('/week_plan/:yyyymmdd', async function(req, res) {
  const yyyy = (req.params.yyyymmdd).slice(0, 4) + '/';
  const mm = (req.params.yyyymmdd).slice(4, 6) + '/';
  const dd = (req.params.yyyymmdd).slice(6, 8);
  const sunday = tools.get_last_sunday(new Date(yyyy+mm+dd));
  const week = tools.get_this_week(sunday);

  var weekdayPlans = {};
  for(var i = 0; i < 7; i++){
    weekday = new Date(week[i]);
    const foundRecipes = await tools.get_all_meals(weekday)
      .then(foundMeals => tools.get_all_recipes(foundMeals)
      .then(foundRecipes => {return foundRecipes}));
    weekdayPlans[i] = foundRecipes;
  }
  Recipe.find({}, function(err, recipeRecords){
    res.render('week_plan', {
      todayDate: sunday,
      thisWeek: week,
      thisWeekRecipes: weekdayPlans,
      recipeItems: recipeRecords,
      tools: tools,
      redirectPath: '/week_plan/' + req.params.yyyymmdd
    });
  });
});

// POST
app.post('/add_day_plan', upload.single('recipeImage'), async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const date = tools.get_today_local(new Date(), cookie.userTimezone);
  if(req.body.recipeChoice){
    recipeId = req.body.recipeChoice
    await tools.compose_meal_plan(date, recipeId);
  } else {
    await tools.compose_recipe_plan(req, date);
  }
  res.redirect('/');
});

app.post('/add_week_plan', upload.single('recipeImage'), async function(req, res) {
  date = req.body.recipeDate;
  if(req.body.recipeChoice){
    recipeId = req.body.recipeChoice
    await tools.compose_meal_plan(date, recipeId);
  } else {
    await tools.compose_recipe_plan(req, date);
  }
  res.redirect(req.body.redirectPath)
});

app.post('/add_recipe_list', upload.single('recipeImage'), function(req, res){
  tools.compose_recipe_plan(req, null);
  res.redirect('/recipe_list')
});

app.post('/delete-recipe', async function(req, res){
  const recipeId = req.body.recipeId;
  const imageId = req.body.imageId;

  await tools.delete_recipe(recipeId, imageId)
  res.redirect('/recipe_list')
});

app.post('/delete-meal', async function(req, res){
  const recipeId = req.body.deleteRecipeId;
  const date = req.body.deleteRecipeDate;
  const redirectPath = req.body.deleteRecipeRedirect;

  await tools.delete_meal(recipeId, date)
  res.redirect(redirectPath)
});

app.post('/edit', upload.single('recipeImage'), async function(req, res){
  await tools.edit_recipe(req);
  res.redirect('/recipe_list/' + req.body.recipeId)
});

app.post('/preferences', async function(req, res) {
  const timezone = req.body.timezone;
  const sid = req.cookies['connect.sid'];

  if (timezone){
    await User.findOneAndUpdate({sid: sid}, {
      userTimezone: timezone
    }, {upsert: true}, function(err){
      if (!err){
        console.log('Successfully updated user preferences.');
      }
    });
  }
  res.redirect('/preferences');
});

app.post('/go_to_date', function(req, res){
  res.redirect('/day_plan/' + req.body.goToDate.replace(/-/g, ''))
});

app.post('/go_to_week', function(req, res){
  res.redirect('/week_plan/' + req.body.goToWeekDate.replace(/-/g, ''))
});

// Server Connection
app.listen(process.env.PORT || 3000, function() {
  console.log('Server started on port 3000');
});

// Functions
