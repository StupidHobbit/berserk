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

// Крысиная королева: the painted fan throws silver cutting fans, while
// the wounded retinue feeds a red pulse into the queen's gilded regalia.
// Landmarks use top-left coordinates of the 496 x 700 card scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 v = b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
float thread(vec2 p, vec2 a, vec2 b, float aa) {
    return 1.0-smoothstep(0.0006,0.0016+aa,lineDistance(p,a,b));
}
float fanShape(vec2 p, vec2 pivot, float radius, float rotation, float aa) {
    vec2 q=(p-pivot)*vec2(1.0,1.42);
    float c=cos(rotation), s=sin(rotation);
    q=mat2(c,-s,s,c)*q;
    float r=length(q);
    // Fan opens upward, with six bright folds and a curved cutting edge.
    float a=atan(q.x,-q.y);
    float sector=1.0-smoothstep(0.72,0.80,abs(a));
    float outer=1.0-smoothstep(radius-aa*1.5,radius+aa*1.5,r);
    float rim=1.0-smoothstep(aa,aa*2.0+0.0005,abs(r-radius));
    float ribs=pow(0.5+0.5*cos(a*23.5),12.0);
    float tip=smoothstep(0.0,radius*0.18,r);
    return sector*tip*(outer*(0.12+0.30*ribs)+rim*0.60);
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Conservative interior, before the wood and stat boxes. Both printed
    // icons and the small value badge are cut out with generous margins.
    float art=smoothstep(0.139,0.155,p.y)*(1.0-smoothstep(0.540,0.555,p.y));
    art*=smoothstep(0.018,0.040,p.x)*(1.0-smoothstep(0.955,0.980,p.x));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.181))/vec2(0.061,0.042)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.261))/vec2(0.061,0.042)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.151,0.286))/vec2(0.030,0.024)));
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float gold=smoothstep(0.025,0.18,scan.r-scan.b)*smoothstep(0.0,0.13,scan.g-scan.b);

    // The actual silver fan, held low on the left: light races out along
    // its ribs to prepare each throw. No resampling moves the paper scan.
    vec2 hinge=vec2(0.183,0.462);
    float paper=oval(p,vec2(0.161,0.422),vec2(0.058,0.056));
    float ribs=0.0;
    for (int i=0;i<7;i++) {
        float f=float(i)/6.0;
        vec2 edge=mix(vec2(0.108,0.414),vec2(0.213,0.381),f);
        edge.y-=sin(f*3.14159265)*0.012;
        ribs+=thread(p,hinge,edge,aa);
    }
    float charge=0.5+0.5*sin(t*2.3+seed-length((p-hinge)*vec2(1.0,1.42))*62.0);
    color+=vec3(0.33,0.40,0.38)*ribs*paper*(0.12+charge*0.42);
    color+=(1.0-color)*vec3(0.17,0.22,0.20)*paper*charge*smoothstep(0.25,0.70,lum);

    // Two translucent fan echoes sweep up the open left side. Their scale
    // and rotation change along the throw; each fades before wrapping.
    float thrown=0.0;
    float trails=0.0;
    for (int i=0;i<2;i++) {
        float age=fract(t*0.24+float(i)*0.5+seed*0.045);
        float fade=smoothstep(0.03,0.17,age)*(1.0-smoothstep(0.65,1.0,age));
        vec2 center=hinge+vec2(-0.094*age+0.025*sin(age*3.14159),-0.137*age);
        float spin=-0.44+age*5.5;
        thrown+=fanShape(p,center,0.033-age*0.011,spin,aa)*fade;
        vec2 prev=center+vec2(0.008,0.014);
        trails+=thread(p,center,prev,aa)*fade*0.20;
    }
    color=mix(color,vec3(0.87,0.94,0.83),clamp(thrown*0.55,0.0,0.50));
    color+=vec3(0.29,0.34,0.25)*trails;

    // Bruised crimson folds of the huge rat retinue pulse in sequence.
    // A few scarlet motes travel from those wounds into the gold breastpiece.
    float wounds=oval(p,vec2(0.635,0.407),vec2(0.115,0.054))
                +oval(p,vec2(0.773,0.416),vec2(0.094,0.075))
                +oval(p,vec2(0.557,0.492),vec2(0.072,0.055));
    float bloodInk=smoothstep(0.025,0.14,scan.r-scan.g);
    float heartbeat=pow(0.5+0.5*sin(t*2.3+seed-p.y*15.0),5.0);
    color+=vec3(0.17,0.014,0.007)*wounds*bloodInk*(0.18+0.82*heartbeat);
    float motes=0.0;
    for (int i=0;i<7;i++) {
        float k=float(i);
        float age=fract(t*0.15+k/7.0+seed*0.035);
        vec2 center=mix(vec2(0.742,0.479),vec2(0.480,0.284),age);
        center.x+=sin(age*6.2831853+k*1.9)*0.012;
        center.y+=sin(age*3.14159265)*0.029;
        float fade=smoothstep(0.0,0.15,age)*(1.0-smoothstep(0.82,1.0,age));
        float d=length((p-center)*vec2(1.0,1.42));
        motes+=fade*((1.0-smoothstep(0.001,0.002+aa,d))*0.42+exp(-d/0.006)*0.19);
    }
    color+=vec3(0.60,0.14,0.045)*motes;
    float crown=oval(p,vec2(0.429,0.188),vec2(0.067,0.027));
    float regalia=oval(p,vec2(0.484,0.289),vec2(0.083,0.057))
                 +oval(p,vec2(0.389,0.327),vec2(0.061,0.034))+crown;
    color+=(1.0-color)*vec3(0.34,0.19,0.028)*regalia*gold*(0.13+heartbeat*0.40);

    if (u_is_foil) {
        // Metallic fan pleats and gold jewelry have a separate iridescent
        // finish; the dark body and background remain painted surfaces.
        float fanAngle=atan(p.x-hinge.x,(hinge.y-p.y)*1.42);
        float phase=p.x*2.0+p.y*1.3-t*0.13+seed*0.08;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float band=pow(0.5+0.5*sin(phase*6.2831853),10.0);
        float pleats=0.45+0.55*pow(0.5+0.5*cos(fanAngle*31.0-t*0.8),5.0);
        float silver=paper*smoothstep(0.22,0.64,lum);
        color+=(1.0-color)*mix(vec3(0.77,0.89,0.86),spectrum,0.62)*silver*(0.16+band*0.58)*pleats;
        color+=(1.0-color)*mix(vec3(1.0,0.66,0.20),spectrum,0.42)
              *clamp(regalia*gold,0.0,1.0)*(0.10+band*0.54);
        // A restrained full-art foil substrate keeps the edition recognizable
        // at listing size; the stronger, art-specific metal highlights remain above.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.28);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
