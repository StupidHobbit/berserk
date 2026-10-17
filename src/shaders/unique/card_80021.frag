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
float hash(float v) { return fract(sin(v*81.37+7.31)*4375.38); }
float stroke(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/u_resolution.x,1.0/u_resolution.y);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // The illustration ends before the raised gold stat ornaments.
    float art=smoothstep(0.132,0.145,p.y)*(1.0-smoothstep(0.537,0.550,p.y));
    art*=smoothstep(0.008,0.024,p.x)*(1.0-smoothstep(0.978,0.993,p.x));
    // Preserve shield, attack badge, and the adjacent 1 counter completely.
    art*=smoothstep(0.057,0.071,length((p-vec2(0.107,0.180))*vec2(1.0,1.42)));
    art*=smoothstep(0.059,0.073,length((p-vec2(0.108,0.264))*vec2(1.0,1.42)));
    art*=smoothstep(0.027,0.038,length((p-vec2(0.151,0.286))*vec2(1.0,1.42)));
    vec3 color=scan.rgb;
    float face=oval(p,vec2(0.518,0.263),vec2(0.110,0.143));

    // Blue ancestral tattoos charge in broad, clearly traveling bands.
    float shoulders=oval(p,vec2(0.286,0.231),vec2(0.156,0.143))
                  +oval(p,vec2(0.717,0.223),vec2(0.139,0.116));
    float blueInk=smoothstep(-0.008,0.075,scan.b-scan.r)
                 *(1.0-smoothstep(0.56,0.73,scan.r));
    float charge=pow(0.5+0.5*sin(p.y*42.0-p.x*7.0-t*3.6+seed*6.28),5.0);
    color+=vec3(0.05,0.31,0.43)*shoulders*blueInk*(0.13+0.87*charge);

    // Crushing force leaves the forward fist and reaches the neighboring rock.
    // Elliptical fronts are angularly clipped to the empty space around the hand.
    vec2 fist=vec2(0.751,0.401);
    vec2 r=(p-fist)*vec2(1.0,1.42);
    float dist=length(r);
    float outward=smoothstep(-0.028,0.055,r.x)
                 *(1.0-smoothstep(0.105,0.162,-r.y));
    float waves=0.0;
    for(int i=0;i<3;i++) {
        float q=fract(t*0.48+float(i)/3.0+seed*0.21);
        float radius=0.046+q*0.237;
        float fade=smoothstep(0.0,0.09,q)*(1.0-smoothstep(0.67,1.0,q));
        float corrugation=0.005*sin(r.y*89.0+float(i)*2.4);
        float d=abs(dist-radius-corrugation);
        waves+=(1.0-smoothstep(0.002,0.005+aa*0.65,d))*fade;
    }
    color+=vec3(0.51,0.31,0.075)*waves*outward*(1.0-face);
    // A moving knuckle reflection makes the source read at compact card size.
    float knuckles=oval(p,vec2(0.739,0.372),vec2(0.088,0.035));
    float knuckleSweep=exp(-pow((p.y-(0.351+0.045*fract(t*0.48+seed*0.21)))/0.010,2.0));
    color+=vec3(0.28,0.15,0.035)*knuckles*knuckleSweep;

    // Rock splinters follow ballistic paths from just beyond the right fist.
    for(int i=0;i<14;i++) {
        float fi=float(i);
        float h=hash(fi+seed*11.0);
        float q=fract(t*(0.32+h*0.12)+hash(fi+5.0));
        vec2 start=vec2(0.804,0.417);
        vec2 velocity=vec2(0.11+0.15*h,-0.14+0.24*hash(fi+17.0));
        vec2 pos=start+velocity*q+vec2(0.0,0.09*q*q);
        vec2 prev=pos-(velocity+vec2(0.0,0.18*q))*0.065;
        float fade=smoothstep(0.0,0.12,q)*(1.0-smoothstep(0.75,1.0,q));
        float d=stroke(p*vec2(1.0,1.42),prev*vec2(1.0,1.42),pos*vec2(1.0,1.42));
        float shard=(1.0-smoothstep(0.0018,0.004+aa*0.5,d))*fade;
        color=mix(color,vec3(0.81,0.58,0.25),shard*0.72);
    }

    if(u_is_foil) {
        // Copper/cobalt foil is visible even in the reduced-motion time-zero pose.
        float contour=p.x*1.8+p.y*2.0+dist*1.3;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(contour-t*0.065+seed*0.15+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*rainbow,
            1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color=mix(color,overlay,0.43*(1.0-face*0.88));
        float ridge=pow(0.5+0.5*sin(contour*24.0-t*0.9),10.0);
        float ink=smoothstep(0.12,0.51,dot(scan.rgb,vec3(0.2126,0.7152,0.0722)));
        color+=(1.0-color)*(vec3(0.10,0.12,0.13)+rainbow*0.13)
              *ridge*ink*(1.0-face*0.92);
        color+=vec3(0.08,0.20,0.23)*shoulders*blueInk*(0.5+0.5*ridge);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
