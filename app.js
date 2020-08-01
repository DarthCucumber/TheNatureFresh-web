var admin = require("firebase-admin");
var express = require("express");
var bodyParser = require("body-parser");
var { auth, storage } = require("./firebaseClientConfig.js");
var session = require("express-session");
var cookieParser = require("cookie-parser");
var serviceAccount = require("./credentials.json");
var axios = require('axios');
var multer = require('multer');
global.XMLHttpRequest = require("xhr2");
const orderRouter = require('./controllers/orderRouter')
const productRouter = require('./controllers/productRouter')
var app = express();

const apihost = 'http://localhost:3000'

let upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10000000 }
}).single('image')

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json())

app.use('/api/orders', orderRouter)
app.use('/api/products', productRouter)

////////////////////
//FIREBASE INIT
////////////////////

const database = require('./database/dbinit')
const db = database.db

//////////////////
//COOKIE SET
//////////////////


app.use(
  session({
    key: "creds",
    secret: "hahalollmao",
    saveUninitialized: false,
    rolling: true,
    resave: true,
    cookie: {
      expires: 900000,
    },
  })
);

app.use((req, res, next) => {
  if (req.cookies.creds && !req.session.user) {
    res.clearCookie("creds");
  }
  next();
});


/////////////////
//MIDDLEWARE START
////////////////

const checkAdmin = (req, res, next) => {
  if (req.session.role == "admin" && req.cookies.creds && req.session.user)
    next();
  else res.redirect('/reroute')
};

const checkUser = (req, res, next) => {
  if (req.session.role == "user" && req.cookies.creds && req.session.user)
    next();
  else res.redirect('/reroute')
};

const checkLogin = (req, res, next) => {
  if (req.session.user && req.cookies.creds) next();
  else res.redirect('/reroute')
};

/////////////////
//MIDDLEWARE END
////////////////


////////////////
// LOGIN START
////////////////

app.get('/signup', (req, res) => {
  if (req.session.user && req.cookies.creds)
    res.redirect('/reroute')
  else
    res.render('signup.ejs')
})

app.get('/signin', (req, res) => {
  if (req.session.user && req.cookies.creds)
    res.redirect('/reroute')
  else
    res.render('signin.ejs')
})

app.post("/signup", upload, async (req, res) => {
  try {
    var bytes = new Uint8Array(req.file.buffer)
    var storageRef = storage.child(req.file.originalname)
    const response = await storageRef.put(bytes, { contentType: req.file.mimetype })
    var imageUrl = await storageRef.getDownloadURL()
  }
  catch (err) {
    console.log(e)
    res.json(e)
  }

  const {
    email,
    phoneNumber,
    password,
    urole,
    uaddress,
    firstName,
    lastName,
  } = req.body;

  admin
    .auth()
    .createUser({
      email,
      phoneNumber,
      password,
      displayName: `${firstName} ${lastName}`,
      photoURL: imageUrl,
    })
    .then((user) => {
      // console.log(user);
      db.collection("users").add({
        uid: user.uid,
        role: urole,
        address: uaddress,
      });

      res.redirect('/signin')
    })
    .catch((err) => {
      console.error(err);
      res.json(err);
    });
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  var frole, fadd;
  try {
    var user = await auth.signInWithEmailAndPassword(email, password);
    var snap = await db
      .collection("users")
      .where("uid", "==", user.user.uid)
      .get();
    snap.forEach((doc) => {
      frole = doc.data().role;
      fadd = doc.data().address;
    });
    req.session.user = user.user;
    req.session.role = frole;
    req.session.address = fadd;
    res.redirect("/reroute");
  } catch (err) {
    console.error("Signin Error!");
    res.json(err);
  }
});

app.get('/reroute', (req, res) => {
  if (req.session.role == "admin" && req.cookies.creds && req.session.user)
    res.redirect('/admin')
  else if (req.session.role == "user" && req.cookies.creds && req.session.user)
    res.redirect('/client-profile')
  else
    res.redirect('/signin')
})

////////////////
// LOGIN END
////////////////

/////////////////////
//ADMIN START
////////////////////

app.get("/admin", checkAdmin, async (req, res) => {
  var response = await axios.get(`${apihost}/api/products`)
  res.render('adminui/admin', { products: response.data, user: req.session.user });
});

app.get("/create-item", checkAdmin, async (req, res) => {
  res.render('adminui/create_item', { user: req.session.user });
});

app.get("/orders", checkAdmin, async (req, res) => {
  var response = await axios.get(`${apihost}/api/orders/`)
  // console.log(response.data);
  res.render('adminui/orders', { products: response.data, user: req.session.user });
});


app.post("/create-item", upload, async (req, res) => {
  const {
    name,
    price,
    description,
    quantity
  } = req.body;

  var bytes = new Uint8Array(req.file.buffer)
  var imageUrl;
  try {
    var storageRef = storage.child(req.file.originalname)
    const response = await storageRef.put(bytes, { contentType: req.file.mimetype })
    imageUrl = await storageRef.getDownloadURL()
    var obj = { image_url: imageUrl, item_name: name, item_description: description, price: parseFloat(price), qty_available: parseInt(quantity) }
    // console.log(obj)
    var apires = await axios.post(`${apihost}/api/products/add`, obj)
    res.redirect('/admin')
  }
  catch (e) {
    res.send("Error!")
    console.error(e)
  }
});

app.get("/edit-user", (req, res) => {
  res.render('adminui/edit_user', { user: req.session.user });
});

app.get("/edit-item/:id", checkAdmin, async (req, res) => {
  var response = await axios.get(`${apihost}/api/products/details/${req.params.id}`)
  // console.log(response.data)
  res.render('adminui/edit_item', { user: req.session.user, product: response.data });
});

app.post("/edit-item/", checkAdmin, async (req, res) => {
  const {
    id,
    name,
    price,
    description,
    quantity
  } = req.body;
  var obj = { item_name: name, item_description: description, price: parseFloat(price), qty_available: parseInt(quantity) }
  // console.log(obj)
  var apires = await axios({
    method: 'post',
    url: `${apihost}/api/products/update/${id}`,
    data: obj,
  });
  res.redirect('/admin')
});

app.get("/edit-order", (req, res) => {
  res.render('adminui/edit_order', { user: req.session.user });
});

app.get("/users", (req, res) => {
  res.render('adminui/users', { user: req.session.user });
});

app.get("/profile", (req, res) => {
  res.render('adminui/profile', { user: req.session.user });
});

/////////////////////
//ADMIN END
////////////////////


////////////////////////
//CLIENT START
////////////////////////

var usercart = {
  products: [],
  itemCount: 0
}

const createOrder = (cart, add, del_chrgs, req) => {
  const ord_date = new Date()
  var tot = 0
  cart.products.forEach(item => {
    tot += parseFloat(item.price * item.qty_purchased)
  })
  var order = {
    user_id: req.session.user.uid,
    phone_number: req.session.user.phoneNumber,
    address: add,
    order_date: ord_date,
    order_day: new Date().toDateString(),
    total: (tot + del_chrgs).toFixed(2),
    gst: (0.07 * tot).toFixed(2),
    delivery_charge: del_chrgs,
    cgst: (0.07 * 0.5 * tot).toFixed(2),
    sgst: (0.07 * 0.5 * tot).toFixed(2),
    orderStatus: "Confirmed",
    cart: cart
  }
  return (order)
}

app.get("/client-profile", checkUser, async (req, res) => {
  var response = await axios.get(`${apihost}/api/orders/${req.session.user.uid}`)
  res.render('clientui/profile', { user: req.session.user, address: req.session.address, orders: response.data });
});

app.get("/shop", checkUser, async (req, res) => {
  var response = await axios.get(`${apihost}/api/products`)
  res.render('clientui/shop', { products: response.data, usercart: usercart, user: req.session.user });
});

app.post('/cart', checkUser, (req, res) => {
  var { cart } = req.body;
  usercart = cart;
  res.status(200).json({ success: true });
})

app.get("/cart", checkUser, (req, res) => {
  res.render('clientui/cart', { cart: usercart, user: req.session.user })
});

app.get('/order-details/:id', checkUser, async (req, res) => {
  var response = await axios.get(`${apihost}/api/orders/ord/${req.params.id}`)
  // console.log(response.data)
  res.render('clientui/order_detail', { user: req.session.user, orders: response.data })
})

app.get("/checkout", checkUser, (req, res) => {
  res.render('clientui/checkout', { user: req.session.user, cart: usercart, address: req.session.address });
});

app.post("/checkout", checkUser, (req, res) => {
  const { address } = req.body;
  var order = createOrder(usercart, address, 50, req)
  res.json(order)
})

////////////////////////
//CLIENT END
////////////////////////


app.get("/", (req, res) => {
  res.redirect('/signin')
});

app.get("/protected", checkAdmin, (req, res) => {
  res.status(200).json({ message: "Protected Resource!" });
});

app.get("/loggedin", checkLogin, (req, res) => {
  res.status(200).json({ message: "Logged In" });
});

app.listen(3000, () => {
  console.log("App Listening at port 3000");
});
