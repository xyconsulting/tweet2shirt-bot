const Twit = require('twit');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const printfulHeaders = {
  'Content-Type': 'application/json',
  'Authorization': 'Basic ' + Buffer.from('b5b87nm4-sod3-sw9r:4sp6-k09sjmckdso3').toString('base64')
}

// Pulling all my twitter account info from another file
let config = require('./config.js');
// Making a Twit object for connection to the API
let T = new Twit(config);
// Setting up a user stream
let stream = T.stream('statuses/filter', { track: ['@StanMattingly'] });

let interval;

async function getImage(tweetId) {
  const html = `
    <blockquote class="twitter-tweet" style="width: 400px;" data-dnt="true">
    <p lang="en" dir="ltr"></p>

    <a href="https://twitter.com/Cernovich/status/${tweetId}"></a>

    </blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
  `
  const data = {
    html: html,
    selector: '.twitter-tweet',
    ms_delay: 1500
  }
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from('704f31c2-8042-4443-ba52-b31ec2776738' + ':' + '36ba94ad-5f6d-4f25-a8a4-60a186725119').toString('base64')
  }

  return axios.post('https://hcti.io/v1/image', data, { headers: headers })
    .then((response) => {
      return response.data.url
    })
}
async function createMockupProcess(image) {
  const data = {
    variant_ids: [4012],
    format: "jpg",
    files: [
      {
        placement: "front",
        image_url: image,
        position: {
          "area_width": 1800,
          "area_height": 2400,
          "width": 1800,
          "height": 1800,
          "top": 300,
          "left": 0
        }
      }
    ]
  }
  let response = await axios.post(`https://api.printful.com/mockup-generator/create-task/71`, data, { headers: printfulHeaders });
  return response.data.result.task_key;

}
function sendTweet(tweetString, reply_to_id){
  T.post('statuses/update', { 
    status: tweetString, 
    in_reply_to_status_id:reply_to_id
  }, function (err, data, response) {
    if(err){
      console.log(err)
    } else{
      console.log("We tweeted!")
    }
  }
  );
}
async function checkMockupStatus(data) {
  let response = await axios.get(`https://api.printful.com/mockup-generator/task?task_key=${data.taskId}`, { headers: printfulHeaders });
  console.log("generating tweet2shirt product");
  if(response.data.result.status === 'completed'){
    clearInterval(interval);
    response.data.result.mockups[0].mockup_url
    const product = await stripe.products.create({
      name: data.designName,
      description: "Comfortable white, cotton t-shirt with a tweet on it :)",
      images: [response.data.result.mockups[0].mockup_url, data.tweetImage],
    });
    const price = await stripe.prices.create({
      unit_amount: 3000,
      currency: 'usd',
      product: product.id,
    });
    console.log("Mockup created + stripe product added.");
    sendTweet(`${data.userAtString} This Tweet Has Been Officially Shirted! See It Here -> ${process.env.FRONT_END_URL}/product/${price.id}`, data.replyToId);
  }
}

stream.on('tweet', async function (tweet) {
  T.get('statuses/show/:id', { id: tweet.in_reply_to_status_id_str }, function (err, data, response) {
  });
  const userAtString = `@${tweet.user.screen_name}`;
  const inReplyUser = `@${tweet.in_reply_to_screen_name}`;
  const designName = `${inReplyUser} Tweet Shirt Created by ${userAtString}`;
  const replyToId = tweet.id_str;
  const tweetImage = await getImage(tweet.in_reply_to_status_id_str);
  //const tweetImage = "https://hcti.io/v1/image/77162a1e-d0e1-464a-b9ae-047ef86ea6f6";
  let mockupTaskId = await createMockupProcess(tweetImage);
  const data = {
    userAtString:userAtString,
    inReplyUser:inReplyUser,
    designName:designName,
    tweetImage:tweetImage,
    taskId:mockupTaskId,
    replyToId:replyToId
  }
  interval = setInterval(checkMockupStatus, 5000, data);

});