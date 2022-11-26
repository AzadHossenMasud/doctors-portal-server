const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { query } = require("express");
const jwt = require("jsonwebtoken");

require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SK);


const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.2kitjkk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  // console.log('inside verifyJWT token ', req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorize access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
    if (err) {
      return res.status(403).send({ message: "forbided access" });
    }
    req.decode = decode;
    next();
  });
  // console.log(token);
};

const run = async () => {
  try {
    const appontmentCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");
    const bookingCollection = client.db("doctorsPortal").collection("booking");
    const userCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db('doctorsPortal').collection('doctors')
    const paymentsCollection = client.db('doctorsPortal').collection('payments')

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      // console.log(date);
      const query = {};
      const options = await appontmentCollection.find(query).toArray();

      const bookingQuery = {
        bookingDate: date,
      };
      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();

      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatmentName === option.name
        );
        const bookSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookSlots.includes(slot)
        );

        option.slots = remainingSlots;
      });

      res.send(options);
    });

    app.get('/appointmentSpeciality', async(req, res)=>{
      const query = {}
      const result = await appontmentCollection.find(query).project({ name: 1}).toArray()
      res.send(result)
    })

    app.get("/booking", verifyJWT, async (req, res) => {
      const email = req.query.email;
      // console.log('token ', req.headers.authorization);

      const decodedEmail = req.decode.email;

      // console.log(email, decodedEmail);

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      // console.log(decodedEmail)
      // console.log(email);
      const query = {
        email: email,
      };
      const myAppontments = await bookingCollection.find(query).toArray();
      // console.log(myAppontments)
      res.send(myAppontments);
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    app.get('/users/admin/:email', async(req, res)=>{
      const email = req.params.email
      const query = {
        email: email
      }

      const user = await userCollection.findOne(query)
      res.send({isAdmin : user?.role === 'admin'})
    })

    app.get('/doctors', async(req, res)=>{
      const query = {}
      const doctors = await doctorsCollection.find(query).toArray()
      res.send(doctors)
    })

    app.get('/booking/:id', async(req, res)=>{
      const id= req.params.id
      const query = {
        _id: ObjectId(id)
      }

      const booking = await bookingCollection.findOne(query)
      res.send(booking)
    })

    // POST

    app.post("/user", async (req, res) => {
      const user = req.body;
      // console.log(user)
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      // console.log(booking);
      const query = {
        bookingDate: booking.bookingDate,
        email: booking.email,
      };

      const alreadyBooken = await bookingCollection.find(query).toArray();
      console.log(alreadyBooken);
      if (alreadyBooken.length > 0) {
        res.send({
          acknowledged: false,
          message:
            "You already booked a date.You can't book onec more in a day",
        });
      } else {
        const result = await bookingCollection.insertOne(booking);
        res.send(result);
      }
    });

    app.post('/doctors', async(req, res)=>{
      const doctor = req.body
      // console.log(doctor);
      const result = await doctorsCollection.insertOne(doctor)
      res.send(result)
      
    })

    app.post('/create-payment-intent', async(req, res)=>{
      const booking = req.body
      const price = booking.price
      const amount = price*100

      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        "payment_method_types": [
          "card"
        ],
      })

      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })

    app.post('/payments', async(req, res)=>{
      const payment = req.body
      const result = await paymentsCollection.insertOne(payment)


    const filter = {
      _id : ObjectId(payment.bookingId)
    }

    const options = { upsert: true}

    const updateDoc = {
      $set: {
        paid: true
      }

    }

    const updateResult = await bookingCollection.updateOne(filter, updateDoc, options)

      res.send(updateResult)
    })

    // PUT

    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decode.email
      // console.log(decodedEmail)
      const query = {
        email: decodedEmail
      }

      const user = await userCollection.findOne(query)
      if(user.role !== 'admin'){
        res.status(403).send({message: 'forbided access'})
      }
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
      // console.log(result);
    });

    // app.get('/addprice', async(req, res)=>{
    //   const filter = {}
    //   const options = {upsert: true}
    //   const updateDoc = {
    //     $set: {
    //       price: 99
    //     }
    //   }

    //   const result = await appontmentCollection.updateMany(filter, updateDoc, options)
    //   res.send(result)
    // })

    // Delete

    app.delete('/doctors/:id', async(req, res)=>{
      const id = req.params.id
      const query = {
        _id: ObjectId(id)
      }
      const result = await doctorsCollection.deleteOne(query)
      res.send(result)
    })

    // jwt
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        // console.log(token);
        return res.send({ accessToken: token });
      }
      // console.log(user)
      res.status(403).send({ accessToken: "Unathorized" });
    });
  } finally {
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`doctors portal running on port ${port}`);
});
