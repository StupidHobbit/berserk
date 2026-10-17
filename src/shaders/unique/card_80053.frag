#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.60, 1.0, length((p-c)/r));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0-v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = 1.0 / max(u_resolution.x, 1.0);
    float t = max(u_time, 0.0);
    float seed = fract(u_seed*0.131)*6.2831853;
    // Art ends above the ice/stat frames. Preserve the attack badge and
    // its protruding counter, including their printed antialias fringes.
    float art = smoothstep(0.138,0.151,p.y)
              * (1.0-smoothstep(0.545,0.555,p.y))
              * smoothstep(0.018,0.035,p.x)
              * (1.0-smoothstep(0.963,0.980,p.x));
    art *= smoothstep(0.058,0.075,length((p-vec2(0.108,0.182))*vec2(1.0,1.42)));
    art *= smoothstep(0.021,0.033,length((p-vec2(0.150,0.207))*vec2(1.0,1.42)));
    vec3 col = scan.rgb;
    float lum = dot(scan.rgb,vec3(0.2126,0.7152,0.0722));

    // The wings cast traveling red/copper light across their stretched
    // membranes. Anatomical masks leave the pale back and claws intact.
    float wing = oval(p,vec2(0.855,0.210),vec2(0.220,0.079))
               + oval(p,vec2(0.410,0.157),vec2(0.170,0.038));
    wing *= smoothstep(0.11,0.31,scan.r-scan.g);
    float wingWave = sin(p.x*20.0+p.y*29.0-t*2.4+seed);
    col *= 1.0+wing*wingWave*0.13;
    col += wing*pow(0.5+0.5*wingWave,7.0)*vec3(0.15,0.055,0.006);

    // Updraft spirals wind around the rock and converge on the gripping
    // talons: the creature's "carry into clouds" ability made visible.
    float lift = 0.0;
    float rearLift = 0.0;
    for (int i=0; i<3; i++) {
        float k = float(i);
        float q = fract(t*0.20+k/3.0+seed*0.031);
        float y = 0.550-q*0.245;
        float radius = 0.185-q*0.055;
        float ellipse = length((p-vec2(0.510,y))/vec2(radius,0.019));
        float d = abs(ellipse-1.0)*0.019;
        float ring = (1.0-smoothstep(0.001,0.003+aa*0.55,d));
        float fade = smoothstep(0.0,0.13,q)*(1.0-smoothstep(0.75,1.0,q));
        float front = smoothstep(y-0.004,y+0.005,p.y);
        // Deliberate broken arcs, with a clearly moving bright crest.
        float arc = 0.35+0.65*pow(0.5+0.5*sin((p.x-0.51)*25.0-t*2.6+k*2.1),3.0);
        lift += ring*fade*front*arc;
        rearLift += ring*fade*(1.0-front)*0.18;
    }
    col += (lift+rearLift)*vec3(0.20,0.31,0.29)*0.82;

    // Long flowing streamers occupy the open sunset beside the head and
    // tail. Their curved crests travel upward, visibly covering distance.
    float wind = 0.0;
    for (int i=0; i<4; i++) {
        float k = float(i);
        float side = step(1.5,k);
        float x = mix(0.070+k*0.065,0.880+(k-2.0)*0.051,side);
        x += 0.022*sin(p.y*30.0+t*1.5+k*2.0);
        float strand = 1.0-smoothstep(0.001,0.003+aa*0.5,abs(p.x-x));
        float head = fract(t*0.27+k*0.24+seed*0.07);
        float y = 0.565-head*0.30;
        float tail = exp(-pow((p.y-y)/0.037,2.0));
        float fade = smoothstep(0.0,0.13,head)*(1.0-smoothstep(0.80,1.0,head));
        wind += strand*tail*fade;
    }
    float openSky = oval(p,vec2(0.115,0.445),vec2(0.18,0.072))
                  + oval(p,vec2(0.943,0.370),vec2(0.070,0.135));
    col += wind*clamp(openSky,0.0,1.0)*vec3(0.19,0.29,0.31);

    // Dust and rock fragments picked up at the perch ascend along the
    // same helix. No particles enter any text, frame or ability counter.
    for (int i=0; i<12; i++) {
        float k = float(i);
        float q = fract(t*0.145+k*0.083333+seed*0.025);
        float angle = q*8.0+k*2.399+seed;
        vec2 spot = vec2(0.510+(0.17-q*0.07)*sin(angle),0.548-q*0.247);
        float d = length((p-spot)*vec2(1.0,1.42));
        float fade = smoothstep(0.0,0.10,q)*(1.0-smoothstep(0.83,1.0,q));
        float sparkle = 1.0-smoothstep(0.0018,0.004+aa*0.65,d);
        float depth = 0.35+0.65*smoothstep(-0.3,0.3,cos(angle));
        col += sparkle*fade*depth*vec3(0.55,0.32,0.10);
    }

    // Small eye glint stays exactly on the dragon's painted eye.
    col += oval(p,vec2(0.174,0.338),vec2(0.010,0.005))
         *vec3(0.30,0.11,0.02)*(0.65+0.35*sin(t*2.2+seed));
    if (u_is_foil) {
        // Copper scales and teal/violet ridges are visible even at t=0.
        // Broad saturated interference bands preserve the ink shadows.
        float phase = p.x*1.8-p.y*2.4+0.10*sin(p.x*17.0+p.y*10.0)-t*0.11+seed*0.08;
        vec3 hue = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay = mix(2.0*col*hue,
            1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        col = mix(col,overlay,0.38);
        float scale = pow(0.5+0.5*sin(p.x*66.0+p.y*80.0-t*1.4),12.0);
        float body = oval(p,vec2(0.45,0.286),vec2(0.28,0.12))
                   + oval(p,vec2(0.819,0.428),vec2(0.11,0.12));
        col += (1.0-col)*hue*scale*clamp(body,0.0,1.0)
             *smoothstep(0.14,0.6,lum)*0.24;
        col += wing*(1.0-col)*hue*0.11;
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
