//jshint esversion:6
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const tools = require('./tools.js');
const dbTools = require('./dbTools.js');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');

var loginFailed = false;
var registerPasswordFailed = false;
var registerUsernameFailed = false;
const app = express();
app.use(cookieParser());

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(session({
  secret: 'Recipe calendar secret',
  resave: true,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

const Recipe = dbTools.Recipe;
const User = dbTools.User;
const Account = dbTools.Account;
const loggedIn = tools.logged_in;

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
app.get(['/','/login'], async function(req, res) {
  await tools.get_user_cookie(req);
  if (req.isAuthenticated()){
    res.redirect('day_plan')
  } else {
    res.render('login', {
      startPill: 'login',
      loginFailed: loginFailed
    });
    loginFailed = false;
  }
});

app.get('/register', async function(req, res) {
  await tools.get_user_cookie(req);
  if (req.isAuthenticated()){
    res.redirect('day_plan')
  } else {
    res.render('login', {
      startPill: 'register',
      registerPasswordFailed: registerPasswordFailed,
      registerUsernameFailed: registerUsernameFailed
    });
    registerPasswordFailed = false;
    registerUsernameFailed = false;
  }
});

app.get('/day_plan',loggedIn, async function(req, res){
    const cookie = await tools.get_user_cookie(req);
    const today = tools.get_today_local(new Date(), cookie.userTimezone);

    const foundRecipes = await tools.get_all_meals(today)
      .then(foundMeals => tools.get_all_recipes(foundMeals, cookie.accountId)
      .then(foundRecipes => {return foundRecipes}));
    Recipe.find({accountId: cookie.accountId}, function(err, recipeRecords){
      res.render('day_plan', {
        todayDate: today,
        todayRecipes: foundRecipes,
        recipeItems: recipeRecords,
        tools: tools,
        routePath: '/day_plan'
      });
    });
});


app.get('/week_plan', loggedIn, async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const today = tools.get_today_local(new Date(), cookie.userTimezone);
  const week = tools.get_this_week(today);
  
  var weekdayPlans = {};
  for(var i = 0; i < 7; i++){
    weekday = new Date(week[i]);
    const foundRecipes = await tools.get_all_meals(weekday)
      .then(foundMeals => tools.get_all_recipes(foundMeals, cookie.accountId)
      .then(foundRecipes => {return foundRecipes}));
    weekdayPlans[i] = foundRecipes;
  }
  Recipe.find({accountId: cookie.accountId}, function(err, recipeRecords){
    res.render('week_plan', {
      todayDate: today,
      thisWeek: week,
      thisWeekRecipes: weekdayPlans,
      recipeItems: recipeRecords,
      tools: tools,
      routePath:'/week_plan'
    });
  });
});

app.get('/recipe_list', loggedIn, async function(req, res) {
  const cookie = await tools.get_user_cookie(req);

  Recipe.find({accountId: cookie.accountId}, function(err, recipeRecords) {
    res.render('recipe_list', {
      recipeItems: recipeRecords
    });
  });
});

app.get('/recipe_list/:recipeId', loggedIn, async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const recipeId = req.params.recipeId;

  Recipe.findOne({
    accountId: cookie.accountId,
    _id: recipeId
  }, function(err, foundRecipe) {
    res.render('recipe', {
      recipe: foundRecipe
    });
  });
});

app.get('/preferences', loggedIn, async function(req, res) {
  const sid = req.cookies['connect.sid'];

  await User.findOne({sid: sid}, function(err, user){
    Account.findOne({_id: user.accountId}, function(err, account){
      res.render('preferences', {
      currentTimezone: user.userTimezone,
      accountUsername: account.username
    });
    })
  });
});

app.get('/day_plan/:yyyymmdd', loggedIn, async function(req, res) {
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
      routePath: '/' + req.params.yyyymmdd
    });
  });
});

app.get('/week_plan/:yyyymmdd', loggedIn, async function(req, res) {
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
      routePath: '/week_plan/' + req.params.yyyymmdd
    });
  });
});

// POST
app.post('/login', async function(req, res){
  await tools.get_user_cookie(req);
  const sid = req.cookies['connect.sid'];
  const account = new User({
    username: req.body.username,
    password: req.body.password
  });
  Account.findOne({username: req.body.username}, function(err, foundAccount){
    if (!foundAccount){
      loginFailed = true;
      res.redirect('/login');
    } else {
      req.login(account, function(err){
        passport.authenticate('local')(req, res, function(){
          User.findOneAndUpdate({sid: sid}, {
            accountId: foundAccount._id
          }, function(err){
            if (!err){
              console.log('Logged in as ' + foundAccount.username);
              res.redirect('day_plan');
            }
          });
        });
      });
    }
  });
});

app.post('/register', async function(req, res){
  await tools.get_user_cookie(req);
  const sid = req.cookies['connect.sid'];
  if (req.body.password !== req.body.confirmPassword) {
    registerPasswordFailed = true;
    res.redirect('register')
  } else {
    Account.findOne({username: req.body.username}, function(err, foundAccount){
      if (foundAccount){
        registerUsernameFailed = true;
        res.redirect('register')
      } else {
        Account.register({username: req.body.username}, req.body.password, function(err, newAccount){
          if (err) {
            console.log(err);
            res.redirect('/register');
          } else {
            passport.authenticate('local')(req, res, function() {
              User.findOneAndUpdate({sid: sid}, {
                accountId: newAccount._id
              }, function(err){
                if (!err){
                  console.log('Registered account ' + newAccount.username);
                }
              });
              res.redirect('day_plan');
            });
          }
        });
      }
    });
  }
});

app.get('/logout', function(req, res){
  const sid = req.cookies['connect.sid'];
  User.findOneAndUpdate({sid: sid}, {
    accountId: ''
  }, function(err){
    if (!err){
      console.log('Logged out');
      req.logout();
      res.redirect('/');
    }
  });
});

app.post('/add_day_plan', upload.single('recipeImage'), async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  const date = tools.get_today_local(new Date(), cookie.userTimezone);
  if(req.body.recipeChoice){
    recipeId = req.body.recipeChoice
    await tools.compose_meal_plan(date, recipeId);
  } else {
    await tools.compose_recipe_plan(req, date, cookie.accountId);
  }
  res.redirect('day_plan');
});

app.post('/add_week_plan', upload.single('recipeImage'), async function(req, res) {
  const cookie = await tools.get_user_cookie(req);
  date = req.body.recipeDate;
  if(req.body.recipeChoice){
    recipeId = req.body.recipeChoice
    await tools.compose_meal_plan(date, recipeId);
  } else {
    await tools.compose_recipe_plan(req, date, cookie.accountId);
  }
  res.redirect(req.body.routePath)
});

app.post('/add_recipe_list', upload.single('recipeImage'), async function(req, res){
  const cookie = await tools.get_user_cookie(req);
  tools.compose_recipe_plan(req, null, cookie.accountId);
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
  const routePath = req.body.deleteRecipeRedirect;

  await tools.delete_meal(recipeId, date)
  res.redirect(routePath)
});

app.get('/delete-account', async function(req, res){
  const cookie = await tools.get_user_cookie(req);
  await tools.delete_account(cookie.accountId)
  res.redirect('logout');
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